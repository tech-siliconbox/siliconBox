import { type Resume, ResumeSchema } from '../schemas/resume';

// An invented resume for tests only: every section filled once.
export const CUSTOM_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

const FULL = {
  template: 'modern',
  design: { font: 'serif', fontSize: 10.5, accent: 'navy', pageSize: 'LETTER' },
  basics: {
    fullName: 'Invented Learner',
    headline: 'Formal Verification Engineer',
    email: 'learner@example.test',
    phone: '+91 98765 43210',
    location: 'Bengaluru',
    links: [{ label: 'GitHub', url: 'https://github.com/invented' }],
  },
  summary: 'Formal verification engineer writing **SVA** and closing proofs with JasperGold.',
  skills: [{ category: 'Formal', items: ['SVA', 'JasperGold', 'k-induction'] }],
  experience: [
    {
      role: 'Verification Intern',
      company: 'Invented Chips',
      location: 'Bengaluru',
      start: '2025-01',
      end: 'Present',
      bullets: ['Wrote 42 SVA properties for an AXI4 bridge.', 'Found 5 deadlocks with BMC.'],
    },
  ],
  projects: [
    {
      name: 'FIFO proof',
      link: 'https://github.com/invented/fifo',
      bullets: ['Proved a FIFO free of overflow with k-induction in SymbiYosys.'],
    },
  ],
  education: [
    {
      degree: 'B.Tech ECE',
      institution: 'Invented Institute',
      start: '2021-08',
      end: '2025-05',
      score: '8.9 CGPA',
    },
  ],
  certifications: [{ name: 'Formal Basics', issuer: 'SiliconBox', year: 2025 }],
  awards: [{ title: 'Hackathon winner', issuer: 'Invented Fest', date: '2024-03', summary: '' }],
  publications: [
    { title: 'Proving arbiters', venue: 'Invented Workshop', date: '2025-02', link: '' },
  ],
  languages: [{ name: 'English', level: 'Fluent' }],
  custom: [
    {
      id: CUSTOM_ID,
      title: 'Positions of responsibility',
      items: [{ title: 'VLSI club lead', subtitle: '', date: '2023', bullets: [] }],
    },
  ],
};

export const fullResume = (): Resume => ResumeSchema.parse(FULL);
