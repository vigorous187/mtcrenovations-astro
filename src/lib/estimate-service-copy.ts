export interface ServiceCopy {
  whatsIncluded: string[];
  whatYouGet: string[];
  whereMoneyGoes: string[];
}

const COPY: Record<string, ServiceCopy> = {
  basement: {
    whatsIncluded: [
      "Framing, insulation, drywall, and finishes scoped to your selection",
      "Electrical rough-in and pot lights where applicable",
      "Permit coordination for legal suite scopes",
      "Dedicated project manager from estimate through completion",
    ],
    whatYouGet: [
      "A finished basement that matches your scope — from basic rec room to legal secondary suite",
      "Clear written scope before work begins",
      "Licensed trades coordinated by one contractor",
    ],
    whereMoneyGoes: [
      "Materials — insulation, drywall, flooring, fixtures, cabinetry",
      "Labour — framing, electrical, plumbing, tiling, painting",
      "Permits, inspections, and project management",
    ],
  },
  bathroom: {
    whatsIncluded: [
      "Demo, waterproofing, tile, fixtures, and vanity installation",
      "Electrical and plumbing updates within scope",
      "Ventilation and moisture management",
      "Cleanup and final walkthrough",
    ],
    whatYouGet: [
      "A bathroom built to last in Hamilton & Burlington homes",
      "Fixture and finish selections aligned to your budget tier",
      "One team accountable for the full renovation",
    ],
    whereMoneyGoes: [
      "Tile, fixtures, vanity, glass, and finishing materials",
      "Skilled trade labour — plumbing, electrical, tiling",
      "Waterproofing, permits, and disposal",
    ],
  },
  kitchen: {
    whatsIncluded: [
      "Cabinet installation, countertops, backsplash, and appliance hookups",
      "Electrical and plumbing updates within scope",
      "Flooring transitions and trim",
      "Project management and trade coordination",
    ],
    whatYouGet: [
      "A kitchen layout and finish level matched to your selections",
      "Fixed scope in writing before demolition",
      "Coordinated trades under one contract",
    ],
    whereMoneyGoes: [
      "Cabinetry, countertops, appliances, and finishing materials",
      "Demolition, rough-in, and installation labour",
      "Permits, design coordination, and project management",
    ],
  },
  flooring: {
    whatsIncluded: [
      "Subfloor prep, underlayment, and installation",
      "Transitions, baseboards, and cleanup",
      "Material guidance for Hamilton & Burlington climate",
    ],
    whatYouGet: [
      "Professional installation with proper prep",
      "Clear line-item scope before work starts",
      "Warranty on workmanship",
    ],
    whereMoneyGoes: [
      "Flooring materials — LVP, hardwood, tile, or carpet",
      "Labour for prep, install, and finishing",
      "Removal and disposal of existing flooring",
    ],
  },
  painting: {
    whatsIncluded: [
      "Surface prep, patching, and primer where needed",
      "Premium paint application on walls, trim, and ceilings",
      "Furniture protection and cleanup",
    ],
    whatYouGet: [
      "Clean, durable finishes throughout your home",
      "Proper prep that extends paint life",
      "Professional crew with minimal disruption",
    ],
    whereMoneyGoes: [
      "Paint, primer, and materials",
      "Skilled painter labour",
      "Prep, masking, and protection",
    ],
  },
  "garden-suite-adu": {
    whatsIncluded: [
      "Design coordination, permits & inspections for garden suites",
      "Foundation through finishes for standalone or laneway ADUs",
      "Separate utility connections & code-compliant egress",
      "Dedicated project manager from estimate through completion",
    ],
    whatYouGet: [
      "A new garden suite or ADU sized to your lot and zoning",
      "JobTread-backed pricing anchored to real MTC projects (e.g. Job #604)",
      "One contractor accountable for the full build",
    ],
    whereMoneyGoes: [
      "Structure, envelope, mechanical & interior finishes",
      "Permits, engineering & utility connections",
      "Project management and skilled trade labour",
    ],
  },
  "multi-unit": {
    whatsIncluded: [
      "Feasibility review for duplex, triplex & fourplex conversions",
      "Structural engineering & permit coordination",
      "Full renovation or vertical addition scopes",
      "Separate entrances, services & code compliance per unit",
    ],
    whatYouGet: [
      "A realistic range for complex multi-unit work in Hamilton",
      "Transparent scope before structural design begins",
      "Experienced team for Winchester-scale conversions",
    ],
    whereMoneyGoes: [
      "Structural mods, additions & unit build-outs",
      "Mechanical, electrical & fire separation upgrades",
      "Permits, engineering, inspections & project management",
    ],
  },
};

const DEFAULT_COPY: ServiceCopy = {
  whatsIncluded: [
    "Licensed, insured renovation work in Hamilton & Burlington",
    "Written scope before work begins",
    "Dedicated project management",
  ],
  whatYouGet: [
    "Transparent pricing and clear communication",
    "Quality materials and skilled trades",
    "A home improvement built to last",
  ],
  whereMoneyGoes: [
    "Materials and supplies",
    "Skilled labour",
    "Permits, project management, and overhead",
  ],
};

export function getServiceCopy(type: string): ServiceCopy {
  return COPY[type] ?? DEFAULT_COPY;
}
