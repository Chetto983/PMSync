/**
 * Create UserLabel taxonomy for auto-triage classification.
 * Based on real email analysis from Sacchi Elettroforniture PST data.
 *
 * Hierarchy:
 *   Commerciale/          (Sales)
 *     ├── Richiesta Offerta
 *     ├── Preventivo
 *     ├── Ordine
 *     └── Quotazione
 *   Tecnico/              (Technical)
 *     ├── Assistenza
 *     ├── Configurazione
 *     ├── Ricambi
 *     └── Documentazione
 *   Logistica/            (Logistics)
 *     ├── Consegna
 *     ├── Spedizione
 *     └── DDT
 *   Amministrativo/       (Administrative)
 *     ├── Fattura
 *     ├── Pagamento
 *     └── Contratto
 *   Interno/              (Internal)
 *     ├── Progetto
 *     ├── Riunione
 *     ├── Formazione
 *     └── HR
 *   Fornitori/            (Suppliers)
 *     ├── Siemens
 *     ├── ABB
 *     ├── Schneider
 *     ├── Phoenix
 *     └── KUKA
 *   Marketing/            (Marketing)
 *     ├── Newsletter
 *     ├── Promozione
 *     └── Evento
 *   Urgente/              (Urgent)
 *     ├── Sollecito
 *     └── Scadenza
 *
 * Usage:
 *   npx ts-node scripts/create-triage-labels.ts
 */

import { createPrismaClient } from '../src/prisma/prisma-client.factory';

const TENANT_ID = 'cmjgylxkg000054yhnjpkmzd9';

// Color palette aligned with theme
const COLORS = {
  blue: { bg: '#1e40af', fg: '#ffffff' },      // Commerciale
  teal: { bg: '#0d9488', fg: '#ffffff' },       // Tecnico
  orange: { bg: '#ea580c', fg: '#ffffff' },     // Logistica
  purple: { bg: '#7c3aed', fg: '#ffffff' },     // Amministrativo
  slate: { bg: '#475569', fg: '#ffffff' },      // Interno
  amber: { bg: '#d97706', fg: '#ffffff' },      // Fornitori
  pink: { bg: '#db2777', fg: '#ffffff' },       // Marketing
  red: { bg: '#dc2626', fg: '#ffffff' },        // Urgente
};

interface LabelDef {
  name: string;
  slug: string;
  color: { bg: string; fg: string };
  icon?: string;
  children?: Omit<LabelDef, 'color' | 'children'>[];
}

const LABEL_TAXONOMY: LabelDef[] = [
  {
    name: 'Commerciale',
    slug: 'commerciale',
    color: COLORS.blue,
    icon: 'briefcase',
    children: [
      { name: 'Richiesta Offerta', slug: 'richiesta-offerta', icon: 'file-text' },
      { name: 'Preventivo', slug: 'preventivo', icon: 'calculator' },
      { name: 'Ordine', slug: 'ordine', icon: 'shopping-cart' },
      { name: 'Quotazione', slug: 'quotazione', icon: 'tag' },
      { name: 'Prezzo', slug: 'prezzo', icon: 'dollar-sign' },
    ],
  },
  {
    name: 'Tecnico',
    slug: 'tecnico',
    color: COLORS.teal,
    icon: 'wrench',
    children: [
      { name: 'Assistenza', slug: 'assistenza', icon: 'life-buoy' },
      { name: 'Configurazione', slug: 'configurazione', icon: 'settings' },
      { name: 'Ricambi', slug: 'ricambi', icon: 'package' },
      { name: 'Documentazione Tecnica', slug: 'documentazione-tecnica', icon: 'book' },
      { name: 'Fuori Produzione', slug: 'fuori-produzione', icon: 'alert-circle' },
      { name: 'Software', slug: 'software', icon: 'code' },
    ],
  },
  {
    name: 'Logistica',
    slug: 'logistica',
    color: COLORS.orange,
    icon: 'truck',
    children: [
      { name: 'Consegna', slug: 'consegna', icon: 'package' },
      { name: 'Spedizione', slug: 'spedizione', icon: 'send' },
      { name: 'DDT', slug: 'ddt', icon: 'file' },
      { name: 'Disponibilità', slug: 'disponibilita', icon: 'check-circle' },
    ],
  },
  {
    name: 'Amministrativo',
    slug: 'amministrativo',
    color: COLORS.purple,
    icon: 'clipboard',
    children: [
      { name: 'Fattura', slug: 'fattura', icon: 'file-text' },
      { name: 'Pagamento', slug: 'pagamento', icon: 'credit-card' },
      { name: 'Contratto', slug: 'contratto', icon: 'file-minus' },
      { name: 'Nota Credito', slug: 'nota-credito', icon: 'file-plus' },
    ],
  },
  {
    name: 'Interno',
    slug: 'interno',
    color: COLORS.slate,
    icon: 'users',
    children: [
      { name: 'Progetto', slug: 'progetto', icon: 'folder' },
      { name: 'Riunione', slug: 'riunione', icon: 'calendar' },
      { name: 'Formazione', slug: 'formazione', icon: 'book-open' },
      { name: 'Visita Cliente', slug: 'visita-cliente', icon: 'map-pin' },
      { name: 'Report', slug: 'report', icon: 'bar-chart' },
    ],
  },
  {
    name: 'Fornitori',
    slug: 'fornitori',
    color: COLORS.amber,
    icon: 'box',
    children: [
      { name: 'Siemens', slug: 'fornitore-siemens', icon: 'zap' },
      { name: 'ABB', slug: 'fornitore-abb', icon: 'zap' },
      { name: 'Schneider', slug: 'fornitore-schneider', icon: 'zap' },
      { name: 'Phoenix Contact', slug: 'fornitore-phoenix', icon: 'zap' },
      { name: 'KUKA', slug: 'fornitore-kuka', icon: 'cpu' },
      { name: 'Pilz', slug: 'fornitore-pilz', icon: 'shield' },
      { name: 'Altro Fornitore', slug: 'fornitore-altro', icon: 'box' },
    ],
  },
  {
    name: 'Marketing',
    slug: 'marketing',
    color: COLORS.pink,
    icon: 'megaphone',
    children: [
      { name: 'Newsletter', slug: 'newsletter', icon: 'mail' },
      { name: 'Promozione', slug: 'promozione', icon: 'percent' },
      { name: 'Evento', slug: 'evento', icon: 'calendar' },
      { name: 'Webinar', slug: 'webinar', icon: 'video' },
    ],
  },
  {
    name: 'Urgente',
    slug: 'urgente',
    color: COLORS.red,
    icon: 'alert-triangle',
    children: [
      { name: 'Sollecito', slug: 'sollecito', icon: 'clock' },
      { name: 'Scadenza', slug: 'scadenza', icon: 'alert-circle' },
      { name: 'Problema', slug: 'problema', icon: 'x-circle' },
      { name: 'Guasto', slug: 'guasto', icon: 'alert-octagon' },
    ],
  },
];

async function main() {
  const prisma = createPrismaClient();

  try {
    // Check existing labels
    const existingLabels = await prisma.userLabel.findMany({
      where: { tenantId: TENANT_ID },
      select: { id: true, slug: true, name: true, parentId: true },
    });

    console.log(`Existing labels: ${existingLabels.length}`);
    if (existingLabels.length > 0) {
      existingLabels.forEach(l => console.log(`  - ${l.name} (${l.slug})`));
    }

    const existingSlugs = new Set(existingLabels.map(l => l.slug));

    let created = 0;
    let skipped = 0;

    for (let pi = 0; pi < LABEL_TAXONOMY.length; pi++) {
      const parent = LABEL_TAXONOMY[pi];

      // Create parent label
      let parentId: string | null = null;

      if (existingSlugs.has(parent.slug)) {
        const existing = existingLabels.find(l => l.slug === parent.slug);
        parentId = existing?.id || null;
        console.log(`  [SKIP] ${parent.name} (exists)`);
        skipped++;
      } else {
        const created_label = await prisma.userLabel.create({
          data: {
            tenantId: TENANT_ID,
            name: parent.name,
            slug: parent.slug,
            type: 'SYSTEM',
            color: parent.color,
            icon: parent.icon || null,
            parentId: null,
            level: 0,
            orderIndex: pi * 10,
          },
        });
        parentId = created_label.id;
        console.log(`  [CREATE] ${parent.name} (parent, order ${pi * 10})`);
        created++;
      }

      // Create children
      if (parent.children && parentId) {
        for (let ci = 0; ci < parent.children.length; ci++) {
          const child = parent.children[ci];
          const childSlug = `${parent.slug}/${child.slug}`;

          if (existingSlugs.has(childSlug)) {
            console.log(`    [SKIP] ${child.name} (exists)`);
            skipped++;
            continue;
          }

          await prisma.userLabel.create({
            data: {
              tenantId: TENANT_ID,
              name: child.name,
              slug: childSlug,
              type: 'SYSTEM',
              color: parent.color, // inherit parent color
              icon: child.icon || null,
              parentId,
              level: 1,
              orderIndex: pi * 10 + ci + 1,
            },
          });
          console.log(`    [CREATE] ${child.name} (child of ${parent.name})`);
          created++;
        }
      }
    }

    // ── Summary ─────────────────────────────────────────────────────────
    const totalLabels = await prisma.userLabel.count({ where: { tenantId: TENANT_ID } });
    const parentLabels = await prisma.userLabel.count({ where: { tenantId: TENANT_ID, parentId: null } });
    const childLabels = totalLabels - parentLabels;

    console.log(`\n${'='.repeat(55)}`);
    console.log(`  LABEL TAXONOMY CREATED`);
    console.log(`${'='.repeat(55)}`);
    console.log(`  Created:  ${created}`);
    console.log(`  Skipped:  ${skipped}`);
    console.log(`  Total:    ${totalLabels} (${parentLabels} parents, ${childLabels} children)`);
    console.log(`\n  Categories: Commerciale, Tecnico, Logistica,`);
    console.log(`              Amministrativo, Interno, Fornitori,`);
    console.log(`              Marketing, Urgente`);

  } finally {
    await prisma.$disconnect();
  }
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
