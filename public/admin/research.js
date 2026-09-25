import {RESEARCH_STATUSES,FACT_STATUSES,INDUSTRIES,INDUSTRY_SHORTCUTS,BUSINESS_TYPES,PRODUCT_CATEGORIES,MARKET_SEGMENTS} from './research-options.js';
import {RESEARCH_FILTER_CHOICES,RESEARCH_SORTS,researchFilters} from './research-filters.js';
import {createResearchTools} from './research-import.js';
import {createResearchReview,researchReviewActions,researchHistory} from './research-review.js';
import {createResearchRefresh,researchRefreshActions} from './research-refresh.js';
import {researchGuidance} from './research-guidance.js';
import {createResearchSimilar} from './research-similar.js';
import {createResearchContacts} from './research-contacts.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g,c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const array = value => Array.isArray(value) ? value : [];
const label = value => String(value ?? '').toLowerCase().replaceAll('_',' ').replace(/^./,c => c.toUpperCase());
const date = value => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleDateString(undefined,{dateStyle:'medium'}) : 'Not recorded';
const tag = (value,accent = false) => `<span class="research-tag${accent ? ' research-tag-accent' : ''}">${escape(value)}</span>`;
const tags = values => array(values).length ? `<div class="research-tags">${values.map(value => tag(value)).join('')}</div>` : '<span class="fine">Unknown</span>';
const fit = value => tag(value ? `${label(value)} Fit` : 'Fit not assessed',value === 'HIGH');
const factStatus = value => tag(label(FACT_STATUSES.includes(value) ? value : 'UNKNOWN'));
const heading = (title,inbox = false) => `<div class="page-heading"><div><p class="eyebrow">SALES / RESEARCH</p><h1>${escape(title)}<span>.</span></h1></div><div class="actions research-heading-actions">${inbox ? '<button class="primary" data-research-import>Import JSON</button><button class="secondary" data-research-prompt>Research prompt</button>' : ''}<button class="secondary" data-research-refresh>Refresh</button></div></div>`;
const panel = (title,content,wide = false) => `<section class="research-panel${wide ? ' research-wide' : ''}"><h2>${escape(title)}</h2>${content}</section>`;

function externalLink(url,title) {
  try {
    const parsed = new URL(url);
    if (!['http:','https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error();
    return `<a class="research-source-link" href="${escape(parsed.href)}" target="_blank" rel="noopener noreferrer">${escape(title || parsed.href)} <span aria-hidden="true">↗</span></a>`;
  } catch { return `<span>${escape(title || 'Link unavailable')}</span>`; }
}

function evidenceMarkup(provenance = {},sources = []) {
  const links = array(provenance.source_urls).map(url => {
    const index = sources.findIndex(source => source.url === url);
    return index >= 0 ? `<a data-research-source href="#research-source-${index+1}">Source ${index+1}</a>` : '';
  }).filter(Boolean);
  if (!provenance.evidence && !links.length && !provenance.confidence) return '';
  return `<details class="research-evidence"><summary>Evidence${provenance.confidence ? ` · ${escape(label(provenance.confidence))} confidence` : ''}</summary>${provenance.evidence ? `<p>${escape(provenance.evidence)}</p>` : ''}<div class="research-evidence-links">${links.join('')}</div></details>`;
}

function fact(title,field,value,candidate,provenance = candidate.field_provenance?.[field] || {}) {
  return `<div class="research-fact"><dt>${escape(title)} ${factStatus(provenance.status)}</dt><dd>${Array.isArray(value) ? tags(value) : escape(value || 'Unknown')}${evidenceMarkup(provenance,array(candidate.sources))}</dd></div>`;
}

function duplicateMarkup(candidate) {
  if (candidate.duplicate_company_id) return `<p>A possible match exists in your CRM.</p><a class="secondary" href="/admin/leads/${encodeURIComponent(candidate.duplicate_company_id)}">Open existing company</a>`;
  if (candidate.duplicate_candidate_id) return `<p>A possible match exists in your Research inbox.</p><a class="secondary" data-research-link href="/admin/ai-research/${encodeURIComponent(candidate.duplicate_candidate_id)}">Open existing candidate</a>`;
  if (candidate.research_status === 'DUPLICATE') return '<p>A possible duplicate was flagged during research.</p>';
  return candidate.duplicate_checked_at
    ? `<p>No match was recorded at the last check.</p><p class="fine">Checked ${escape(date(candidate.duplicate_checked_at))}</p>`
    : '<p class="fine">Not checked yet.</p>';
}

function card(candidate) {
  const duplicate = candidate.duplicate_company_id || candidate.duplicate_candidate_id || candidate.research_status === 'DUPLICATE';
  const inLeads = Boolean(candidate.approved_company_id);
  return `<article class="research-card${inLeads ? ' research-card-in-leads' : ''}">
    <div class="research-card-top">${inLeads ? tag('In Leads',true) : tag(RESEARCH_STATUSES[candidate.research_status] || 'Unknown')}${fit(candidate.fit)}</div>
    <h2><a class="research-card-link" data-research-link href="/admin/ai-research/${encodeURIComponent(candidate.id)}">${escape(candidate.company_name)}</a></h2>
    <p class="research-location">${escape([candidate.country || 'Country unknown',candidate.industry,...array(candidate.product_categories).slice(0,2)].filter(Boolean).join(' · '))}</p>
    <p class="fine">${escape(candidate.normalized_domain || 'Website not recorded')}</p>
    <div class="research-tags">${candidate.business_type ? tag(candidate.business_type) : ''}${candidate.positioning_value ? tag(candidate.positioning_value)+' '+factStatus(candidate.positioning_status) : ''}</div>
    ${array(candidate.best_services).length ? `<div class="research-card-section"><p class="eyebrow">Best opportunities</p>${tags(candidate.best_services)}</div>` : ''}
    ${array(candidate.top_signals).length ? `<div class="research-card-section"><p class="eyebrow">Signals</p>${tags(candidate.top_signals.map(label))}</div>` : ''}
    <p class="research-summary">${escape(candidate.summary || 'No research summary recorded.')}</p>
    <div class="research-card-footer"><span>${escape(candidate.research_confidence ? label(candidate.research_confidence)+' confidence' : 'Confidence unknown')} · ${Number(candidate.source_count)||0} sources</span><span>${duplicate ? 'Possible duplicate' : candidate.duplicate_checked_at ? 'Duplicate check recorded' : 'Duplicates not checked'}</span></div>
    <a class="research-open" data-research-link href="/admin/ai-research/${encodeURIComponent(candidate.id)}">View research <span aria-hidden="true">↗</span></a>
    ${inLeads ? `<a class="research-lead-link" href="/admin/leads/${encodeURIComponent(candidate.approved_company_id)}">Open lead <span aria-hidden="true">↗</span></a>` : ''}
  </article>`;
}

function detail(candidate,back,events = []) {
  const sources = array(candidate.sources), services = array(candidate.potential_services), signals = array(candidate.opportunity_signals);
  const guidance = researchGuidance(candidate);
  const weights = {HIGH:3,MEDIUM:2,LOW:1};
  return `<a class="research-back" data-research-link href="${escape(back)}">← Research inbox</a>${heading(candidate.company_name)}
    <div class="research-detail-meta">${tag(RESEARCH_STATUSES[candidate.research_status] || 'Unknown')}${fit(candidate.fit)}${tag(candidate.research_confidence ? label(candidate.research_confidence)+' research confidence' : 'Research confidence unknown')}<span class="fine">Last researched: ${escape(date(candidate.last_researched_at))}</span></div>
    ${researchReviewActions(candidate)}
    ${researchRefreshActions(candidate)}
    <div class="actions research-similar-actions"><button class="secondary" data-research-similar>Find similar companies</button><button class="secondary" data-research-contacts>Find contacts</button></div>
    <p class="research-intro">${escape(candidate.short_description || 'No company description recorded.')}</p>
    <div class="research-detail-grid">
    ${panel('Missing information',array(guidance.missing).length ? `<ul class="research-missing">${guidance.missing.map(item => `<li><span>${escape(item.label)}</span><span class="fine">${escape(item.reason)}</span></li>`).join('')}</ul>` : '<p class="fine">The current research covers the information checked here. Its accuracy can still be reviewed against current sources.</p>')}
    ${panel('Suggested next research action',`<p>${escape(guidance.nextAction)}</p>`)}
    ${panel('Company profile',`<dl class="research-facts">${fact('Company','company_name',candidate.company_name,candidate)}${fact('Country','country',candidate.country,candidate)}${fact('City','city',candidate.city,candidate)}${fact('Industry','industry',candidate.industry,candidate)}${fact('Business type','business_type',candidate.business_type,candidate)}${fact('Positioning','positioning',candidate.positioning?.value,candidate,candidate.positioning || {})}</dl><div class="research-fact"><p class="fine">Website ${factStatus(candidate.field_provenance?.website?.status)}</p>${candidate.website ? externalLink(candidate.website,candidate.normalized_domain) : '<p>Unknown</p>'}${evidenceMarkup(candidate.field_provenance?.website,sources)}</div>`)}
    ${panel('Products & market',`<dl class="research-facts">${fact('Products','product_categories',array(candidate.product_categories),candidate)}${fact('Other products','secondary_categories',array(candidate.secondary_categories),candidate)}${fact('Market segments','market_segments',array(candidate.market_segments),candidate)}</dl>`)}
    ${panel('Shapeviz Fit',`${fit(candidate.fit)}${array(candidate.manual_fields).some(field => ['fit','fit_reason'].includes(field)) ? '<p class="fine">Manually reviewed</p>' : ''}<p class="research-prose">${escape(candidate.fit_reason || 'Fit has not been assessed.')}</p><p class="fine">Fit describes potential relevance to Shapeviz. Research confidence describes the available information.</p>`)}
    ${panel('Suggested pitch angle',`<p class="research-prose">${escape(candidate.suggested_pitch_angle || 'No pitch angle recorded.')}</p>`)}
    ${panel('Research summary',`<p class="research-prose">${escape(candidate.research_summary || 'No research summary recorded.')}</p><p class="fine">Description provenance: ${factStatus(candidate.field_provenance?.short_description?.status)}</p>${evidenceMarkup(candidate.field_provenance?.short_description,sources)}`,true)}
    ${panel('Recommended services',services.length ? `<ul class="research-items">${[...services].sort((a,b) => (weights[b.relevance]||0)-(weights[a.relevance]||0)).map(service => `<li><div class="research-item-heading"><h3>${escape(service.service)}</h3>${tag(label(service.relevance)+' relevance',service.relevance==='HIGH')}</div>${service.reason ? `<p>${escape(service.reason)}</p>` : ''}</li>`).join('')}</ul>` : '<p class="fine">No service recommendations recorded.</p>')}
    ${panel('Opportunity signals',signals.length ? `<ul class="research-items">${signals.map(signal => `<li><h3>${escape(label(signal.signal))}</h3><div class="research-tags">${factStatus(signal.status)}${tag(label(signal.confidence)+' confidence')}</div><p>${escape(signal.evidence)}</p>${evidenceMarkup({...signal,evidence:''},sources)}</li>`).join('')}</ul>` : '<p class="fine">No opportunity signals recorded.</p>')}
    ${panel('Sources',sources.length ? `<ol class="research-sources">${sources.map((source,index) => `<li id="research-source-${index+1}" tabindex="-1">${externalLink(source.url,source.title || source.url)}<p class="fine">${escape(source.source_type || 'Public source')} · Retrieved: ${escape(date(source.retrieved_at))}</p>${array(source.supports).length ? `<p class="fine">Supports: ${escape(source.supports.map(label).join(', '))}</p>` : ''}</li>`).join('')}</ol>` : '<p class="fine">No research sources recorded.</p>',true)}
    ${panel('Duplicate check',duplicateMarkup(candidate))}
    ${panel('Research record',`<dl class="research-record"><dt>Origin</dt><dd>${escape(label(candidate.source_origin))}</dd><dt>Added</dt><dd>${escape(date(candidate.created_at))}</dd><dt>Updated</dt><dd>${escape(date(candidate.updated_at))}</dd>${candidate.approved_at ? `<dt>Approved</dt><dd>${escape(date(candidate.approved_at))}</dd>` : ''}${candidate.rejected_at ? `<dt>Rejected</dt><dd>${escape(date(candidate.rejected_at))}</dd>` : ''}</dl>${candidate.rejection_reason ? `<p class="research-prose">Rejection reason: ${escape(candidate.rejection_reason)}</p>` : ''}`)}
    ${array(candidate.manual_fields).length ? panel('Manual corrections',`<p>${escape(candidate.manual_fields.map(label).join(', '))}</p><p class="fine">These fields were changed during human review. See the history for recorded changes.</p>`) : ''}
    ${researchHistory(events)}
    </div>`;
}

const select = (name,title,labels = {}) => `<label>${escape(title)}<select name="${name}">${name === 'sort' ? '' : '<option value="">All</option>'}${RESEARCH_FILTER_CHOICES[name].map(value => `<option value="${escape(value)}">${escape(labels[value] || label(value))}</option>`).join('')}</select></label>`;
const input = (name,title,values) => `<label>${escape(title)}<input name="${name}" maxlength="120" list="research-${name}-options"></label><datalist id="research-${name}-options">${values.map(value => `<option value="${escape(value)}"></option>`).join('')}</datalist>`;

export function createResearch({root,api,navigate}) {
  let active = false, generation = 0, listQuery = '', currentCandidate = null, savedMessage = '';
  const current = version => active && generation === version;
  const back = () => '/admin/ai-research'+listQuery;
  const tools = createResearchTools({api,onImported:() => {if (active) {api.invalidate?.();show();}}});
  const review = createResearchReview({api,onChanged:result => {if (active) {savedMessage=array(result.warnings).map(item => item.message || item).join(' ');api.invalidate?.();show();}}});
  const refresh = createResearchRefresh({api,onChanged:result => {if (active) {savedMessage=array(result.warnings).map(item => item.message || item).join(' ');api.invalidate?.();show();}}});
  const similar = createResearchSimilar({api,onImport:()=>{if(active)tools.openImport();}});
  const contacts = createResearchContacts({api,onChanged:()=>api.invalidate?.()});

  function listShell() {
    root.innerHTML = heading('AI Research',true)+'<p class="research-intro">Understand the company. See the opportunity.</p>'+`
      <form id="research-filters"><div class="research-main-filters"><label>Search research<input name="q" type="search" maxlength="160" placeholder="Company, domain, products, services…"></label>${select('research_status','Research status',RESEARCH_STATUSES)}${select('fit','Fit')}${select('sort','Sort',RESEARCH_SORTS)}</div>
      <fieldset class="research-industries"><legend>Browse by industry</legend><div class="research-industry-options">${Object.entries({'':'All industries',...INDUSTRY_SHORTCUTS}).map(([value,title]) => `<button type="button" class="secondary research-industry" data-research-industry="${escape(value)}" aria-pressed="false">${escape(title)}</button>`).join('')}</div></fieldset>
      <label class="research-hide-leads"><input type="checkbox" name="hide_in_leads" value="true">Hide companies in Leads</label>
      <details class="crm-filters"><summary>More filters</summary><div class="crm-filter-grid">
        <label>Country code<input name="country" maxlength="2" placeholder="e.g. CZ"></label>${select('country_category','Country group',{INT:'International'})}
        ${input('industry','Industry',INDUSTRIES)}${input('business_type','Business type',BUSINESS_TYPES)}${input('product_category','Product category',PRODUCT_CATEGORIES)}${input('market_segment','Market segment',MARKET_SEGMENTS)}
        ${select('potential_service','Potential service',Object.fromEntries(RESEARCH_FILTER_CHOICES.potential_service.map(value => [value,value])))}${select('opportunity_signal','Opportunity signal')}${select('research_confidence','Research confidence')}${select('source_origin','Source origin',{CHATGPT:'ChatGPT'})}
        ${select('duplicate_status','Duplicate status',{unchecked:'Not checked',possible:'Possible duplicate',clear:'No match at last check'})}${select('last_researched','Last researched',{never:'Not recorded',last30:'Within 30 days',older30:'More than 30 days ago'})}
      </div></details><div class="actions"><button type="submit" class="secondary">Apply filters</button><button type="button" class="quiet" data-research-clear>Clear filters</button></div></form>
      <div id="research-results" aria-live="polite"><p class="fine">Loading research candidates…</p></div>`;
    const form = root.querySelector('#research-filters'), params = new URLSearchParams(location.search);
    for (const element of form.elements) if (element.name && params.has(element.name)) {
      if (element.type === 'checkbox') element.checked = params.get(element.name) === 'true';
      else element.value = params.get(element.name);
    }
    for (const button of form.querySelectorAll('[data-research-industry]')) button.setAttribute('aria-pressed',String(button.dataset.researchIndustry.toLowerCase() === (params.get('industry') || '').toLowerCase()));
    if ([...params.keys()].some(key => !['q','research_status','fit','sort','page','hide_in_leads'].includes(key))) form.querySelector('details').open = true;
    form.elements.hide_in_leads.onchange = () => form.requestSubmit();
    form.onsubmit = event => {
      event.preventDefault();
      try {
        const filters = researchFilters(Object.fromEntries(new FormData(form)));
        if (filters.sort === 'newest') delete filters.sort;
        const query = new URLSearchParams(filters).toString();
        navigate('/admin/ai-research'+(query ? '?'+query : ''));
      } catch (error) { root.querySelector('#research-results').innerHTML = `<p role="alert">${escape(error.message)}</p>`; }
    };
  }

  async function show() {
    tools.close();
    review.close(); refresh.close(); similar.close(); contacts.close(); currentCandidate = null;
    active = true;
    const version = ++generation, match = location.pathname.match(/^\/admin\/ai-research\/([^/]+)\/?$/);
    root.setAttribute('aria-busy','true');
    if (match) root.innerHTML = `<a class="research-back" data-research-link href="${escape(back())}">← Research inbox</a>${heading('Research candidate')}<div id="research-results" aria-live="polite"><p class="fine">Loading research…</p></div>`;
    else { listQuery = location.search; listShell(); }
    try {
      if (match) {
        const {candidate,events} = await api('crm-research-detail',null,{id:match[1]});
        if (current(version)) {currentCandidate=candidate;root.innerHTML=detail(candidate,back(),events);if(savedMessage){root.querySelector('.research-review-actions').insertAdjacentHTML('afterend',`<p role="status" class="fine">${escape(savedMessage)}</p>`);savedMessage='';}}
      } else {
        const result = await api('crm-research-list',null,Object.fromEntries(new URLSearchParams(listQuery)));
        if (!current(version)) return;
        const filtered = [...new URLSearchParams(listQuery).keys()].some(key => !['sort','page'].includes(key));
        const pages = Math.max(1,Math.ceil(result.total/result.pageSize));
        root.querySelector('#research-results').innerHTML = `<p class="fine research-count">${Number(result.total)||0} ${filtered ? 'matching ' : ''}${result.total===1 ? 'candidate' : 'candidates'}</p>`+
          (array(result.items).length ? `<div class="research-grid">${result.items.map(card).join('')}</div>` : `<div class="research-empty"><p class="eyebrow">RESEARCH INBOX</p><h2>${result.page>1 ? 'No candidates on this page.' : filtered ? 'No matching candidates.' : 'No research candidates yet.'}</h2><p>${filtered ? 'Try another search or clear your filters.' : 'Keep company research separate from your Leads. Saved candidates will appear here for review.'}</p>${result.page>1 ? '<button class="secondary" data-research-page="1">Go to first page</button>' : filtered ? '<button class="secondary" data-research-clear>Clear filters</button>' : ''}</div>`)+
          `<nav class="research-pagination" aria-label="Research pages"><button class="secondary" data-research-page="${result.page-1}" ${result.page<=1 ? 'disabled' : ''}>Previous</button><span class="fine">Page ${result.page} of ${pages}</span><button class="secondary" data-research-page="${result.page+1}" ${result.page>=pages ? 'disabled' : ''}>Next</button></nav>`;
      }
    } catch (error) {
      if (current(version)) root.querySelector('#research-results').innerHTML = `<div class="research-empty"><p role="alert">${escape(error.message)}</p><button class="secondary" data-research-refresh>Try again</button></div>`;
    } finally { if (current(version)) root.removeAttribute('aria-busy'); }
  }

  root.addEventListener('click',event => {
    if (!active) return;
    const target = event.target.closest('a,button');
    if (!target) return;
    if (target.hasAttribute('data-research-source') && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey && event.button === 0) {
      event.preventDefault();
      const source = root.querySelector(target.getAttribute('href'));
      source?.scrollIntoView({block:'start'});source?.focus({preventScroll:true});return;
    }
    if (target.hasAttribute('data-research-link') && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey && event.button === 0) {
      event.preventDefault(); navigate(target.getAttribute('href')); return;
    }
    if (target.hasAttribute('data-research-refresh')) { api.invalidate?.(); show(); }
    if (target.hasAttribute('data-research-import')) tools.openImport();
    if (target.hasAttribute('data-research-prompt')) tools.openPrompt();
    if (currentCandidate) {
      if (target.hasAttribute('data-research-edit')) review.openEdit(currentCandidate);
      if (target.hasAttribute('data-research-reject')) review.openReject(currentCandidate);
      if (target.hasAttribute('data-research-restore')) review.openRestore(currentCandidate);
      if (target.hasAttribute('data-research-approve')) review.openApproval(currentCandidate);
      if (target.hasAttribute('data-research-deeper')) refresh.open(currentCandidate,'deeper');
      if (target.hasAttribute('data-research-again')) refresh.open(currentCandidate,'refresh');
      if (target.hasAttribute('data-research-similar')) similar.open({type:'candidate',id:currentCandidate.id,name:currentCandidate.company_name,country:currentCandidate.country,status:currentCandidate.research_status});
      if (target.hasAttribute('data-research-contacts')) contacts.open(currentCandidate);
    }
    if (target.hasAttribute('data-research-clear')) navigate('/admin/ai-research');
    if (target.hasAttribute('data-research-industry')) {
      const form = root.querySelector('#research-filters');
      form.elements.industry.value = target.dataset.researchIndustry;
      form.requestSubmit();
    }
    if (target.dataset.researchPage) {
      const params = new URLSearchParams(location.search); params.set('page',target.dataset.researchPage);
      navigate('/admin/ai-research?'+params);
    }
  });
  return {show,hide(){ active = false; generation++; currentCandidate=null;tools.close();review.close();refresh.close();similar.close();contacts.close();root.removeAttribute('aria-busy'); }};
}
