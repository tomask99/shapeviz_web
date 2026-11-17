export const pradaDescription = {
  sk: '3D produkcia pre Pradu v spolupráci s francúzskym štúdiom. Projekt vznikol ako súčasť práce širšieho tvorivého tímu.',
  en: '3D production for Prada in collaboration with a French studio, delivered as part of a larger creative team.'
};

export const pradaCollaboration = {sk:'The New Face / Francúzsko', en:'The New Face / France'};
export const pradaContributions = {
  sk:['Kompletné 3D modely — 3ds Max', 'Textúry — Substance Painter', 'Tvorba prostredia — Houdini', 'Rendering — Karma'],
  en:['All 3D models — 3ds Max', 'Textures — Substance Painter', 'Environment build — Houdini', 'Rendering — Karma']
};

export function companyDetails(company) {
  const isPrada = company.name.trim().toUpperCase() === 'PRADA';
  return {
    description: companyDescription(company),
    collaboration: company.collaboration ?? (isPrada ? pradaCollaboration : null),
    contributions: company.contributions ?? (isPrada ? pradaContributions : null)
  };
}

export function companyDescription(company) {
  return company.description ?? (company.name.trim().toUpperCase() === 'PRADA' ? pradaDescription : null);
}
