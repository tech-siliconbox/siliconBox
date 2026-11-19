# Praman Tcl host: `tclsh host.tcl <command> ...`, one process per session.
#
# User scripts run in a SAFE child interpreter (no exec, open, socket, file,
# cd, ...).  The Praman commands named on the command line are aliases that
# ask the Python side (app/praman/tclhost.py) over stdin/stdout:
#
#   Python -> Tcl   EVAL =<script>                  run a script in the child
#   Tcl -> Python   CALL <command> =<arg> ...       a Praman command; then
#   Python -> Tcl     OK =<result> | ERR =<message> | EXIT =<message>
#   Tcl -> Python   OUT <newline 0|1> =<text>       puts
#   Tcl -> Python   ECHO <depth> =<command>         a command of a sourced file
#   Tcl -> Python   RET ok|error|exit =<result>     the EVAL is done
#
# Every value is "=" + base64(UTF-8), so a message is one line of ASCII.
# Works with Tcl 8.6 and 9.

package require Tcl 8.6-

fconfigure stdin  -translation lf -buffering line
fconfigure stdout -translation lf -buffering line

set ::depth 0
set ::commands $argv
# seconds of Tcl computing per EVAL (time in Praman commands is not counted)
set ::budget 30
if {[info exists ::env(PRAMAN_TCL_BUDGET)]} { set ::budget $::env(PRAMAN_TCL_BUDGET) }
set ::deadline 0

proc enc {s} { return "=[binary encode base64 [encoding convertto utf-8 $s]]" }
proc dec {s} { return [encoding convertfrom utf-8 [binary decode base64 [string range $s 1 end]]] }
proc send {args} { puts stdout [join $args " "]; flush stdout }

proc host_call {name args} {
    set msg [list CALL $name]
    foreach a $args { lappend msg [enc $a] }
    set t0 [clock seconds]
    send {*}$msg
    if {[gets stdin line] < 0} { exit 0 }
    # the child was waiting, not computing: give the time back
    incr ::deadline [expr {[clock seconds] - $t0}]
    interp limit sess time -seconds $::deadline
    set parts [split $line " "]
    set value [dec [lindex $parts 1]]
    switch -- [lindex $parts 0] {
        OK      { return $value }
        EXIT    { return -code error -errorcode PRAMAN_EXIT $value }
        default { return -code error $value }
    }
}

proc host_puts {args} {
    set nl 1
    if {[lindex $args 0] eq "-nonewline"} { set nl 0; set args [lrange $args 1 end] }
    if {[llength $args] == 2} {
        set chan [lindex $args 0]
        if {$chan ni {stdout stderr}} { return -code error "can not find channel named \"$chan\"" }
        set args [lrange $args 1 end]
    }
    if {[llength $args] != 1} {
        return -code error {wrong # args: should be "puts ?-nonewline? ?channelId? string"}
    }
    send OUT $nl [enc [lindex $args 0]]
    return
}

# source / include: the file comes from the session's files; its commands
# are echoed one by one and their results printed, and the first error stops
# the script with the file name and line.
proc host_source {args} {
    if {[llength $args] != 1} { return -code error {wrong # args: should be "source fileName"} }
    set file [lindex $args 0]
    return [run_script [host_call __read $file] $file]
}

proc run_script {text file} {
    incr ::depth
    set cmd ""; set n 0; set start 0; set result ""
    foreach line [split $text \n] {
        incr n
        if {$cmd eq ""} {
            set start $n
            set trimmed [string trim $line]
            if {$trimmed eq ""} continue
            if {[string index $trimmed 0] eq "#" && [string index $trimmed end] ne "\\"} {
                send ECHO $::depth [enc $line]
                continue
            }
        }
        append cmd $line
        set continued [expr {[regexp {(\\+)$} $line -> bs] && [string length $bs] % 2}]
        if {$continued || ![info complete $cmd]} { append cmd \n; continue }
        send ECHO $::depth [enc $cmd]
        set code [catch {sess eval $cmd} result opts]
        if {$code == 1} {
            incr ::depth -1
            set ec [dict get $opts -errorcode]
            if {[lindex $ec 0] eq "PRAMAN_EXIT"} { return -code error -errorcode PRAMAN_EXIT $result }
            return -code error "$result\n    (file \"$file\" line $start)"
        }
        if {$code == 2} { set cmd ""; break }
        if {$result ne ""} { send OUT 1 [enc $result] }
        set cmd ""
    }
    incr ::depth -1
    if {[string trim $cmd] ne ""} {
        return -code error "incomplete command at the end of \"$file\" (starts at line $start)"
    }
    return ""
}

proc new_child {} {
    catch {interp delete sess}
    interp create -safe sess
    foreach c $::commands { interp alias sess $c {} host_call $c }
    interp alias sess puts {} host_puts
    interp alias sess source {} host_source
    interp alias sess include {} host_source
    sess eval {array set env {}}
}

new_child

while {[gets stdin line] >= 0} {
    set parts [split $line " "]
    switch -- [lindex $parts 0] {
        EVAL {
            set ::depth 0
            set ::deadline [expr {[clock seconds] + $::budget}]
            interp limit sess time -seconds $::deadline
            set code [catch {sess eval [dec [lindex $parts 1]]} result opts]
            set status ok
            if {$code == 1} {
                set status error
                if {[lindex [dict get $opts -errorcode] 0] eq "PRAMAN_EXIT"} { set status exit }
            }
            send RET $status [enc $result]
        }
        RESET { new_child; send RET ok [enc ""] }
        QUIT  { exit 0 }
    }
}
