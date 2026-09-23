// Gaps describe this record, never proof that the company lacks a capability.
// Shared by the candidate detail and copyable research prompts.
export function researchGuidance(candidate = {}) {
  const missing = [];
  const list = value => Array.isArray(value) ? value : [];
  const add = (key,label,reason) => missing.push({key,label,reason});
  const fact = (key,label) => {
    const value = candidate[key];
    if (Array.isArray(value) ? !value.length : !value) add(key,label,'Not recorded');
    else if (candidate.field_provenance?.[key]?.status !== 'VERIFIED') add(key,label,'Needs verification');
  };
  fact('website','Company website');
  fact('business_type','Business model');
  fact('product_categories','Product catalogue details');
  fact('market_segments','Markets and audiences');
  if (!list(candidate.sources).length) add('sources','Public research sources','Not recorded');
  if (!candidate.fit || !candidate.fit_reason) add('fit','Explained Shapeviz Fit','Not assessed');
  if (!list(candidate.potential_services).length) add('potential_services','Relevant Shapeviz services','Not assessed');
  const signals = list(candidate.opportunity_signals);
  const sourceTypes = new Set(list(candidate.sources).map(source => source.source_type));
  if (!sourceTypes.has('Professional / Architect Page') && !signals.some(item => ['ARCHITECT_AUDIENCE','DESIGNER_AUDIENCE'].includes(item.signal))) {
    add('professional_resources','Professional / architect resources','Not yet researched');
  }
  if (!signals.some(item => ['HAS_3D_DOWNLOADS','HAS_CAD_BIM_SECTION','NO_3D_DOWNLOADS_FOUND'].includes(item.signal))) {
    add('asset_availability','CAD, BIM and 3D asset availability','Not yet researched');
  }
  let nextAction;
  if (!candidate.website) nextAction = 'Find and verify the official company website.';
  else if (!list(candidate.sources).length) nextAction = 'Record public sources for the company profile before reassessing Fit.';
  else if (missing.some(item => item.key === 'product_categories')) nextAction = 'Review the product catalogue and verify the main product categories.';
  else if (missing.some(item => item.key === 'professional_resources' || item.key === 'asset_availability')) nextAction = 'Check professional pages and downloads for architect resources and CAD, BIM or 3D assets.';
  else nextAction = 'Recheck current collections and source evidence, then review whether the Fit and service recommendations still apply.';
  return {missing,nextAction};
}
