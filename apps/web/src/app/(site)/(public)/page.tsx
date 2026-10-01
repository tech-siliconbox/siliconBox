import Link from 'next/link';
import { ROUTES } from '@siliconbox/shared';
import { buttonVariants } from '@/components/ui/button';
import { Eyebrow } from '@/components/ui/eyebrow';

export default function LandingPage() {
  return (
    <section className="mx-auto flex max-w-4xl flex-col gap-6 px-6 pb-14 pt-28">
      <Eyebrow>Formal verification</Eyebrow>
      <h1 className="text-5xl font-bold leading-[1.06] tracking-tighter sm:text-6xl">
        Learn formal verification by proving real designs
      </h1>
      <p className="max-w-2xl text-base leading-relaxed text-muted-foreground">
        Read short lessons, practise on hands-on Drills, and run your properties on a formal tool
        built into every Drill.
      </p>
      <div className="flex flex-wrap gap-3">
        <Link href={ROUTES.signUp} className={buttonVariants({ size: 'lg' })}>
          Get started
        </Link>
        <Link
          href={ROUTES.courses}
          className={buttonVariants({ variant: 'secondary', size: 'lg' })}
        >
          Browse courses
        </Link>
      </div>
      <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
        Lessons · Drills · Formal tool
      </p>
    </section>
  );
}
