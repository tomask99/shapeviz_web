import {createHash} from 'node:crypto';
import {validateResearchImport} from '../research/validation.js';

export const IMPORT_WORKFLOW = Object.freeze([
  'Before delivering an import file, call validate_research_import with the exact final JSON text, including all candidates.',
  'Fix every reported error and validate again until valid=true. Revalidate after any edit; deliver the same validated contents.',
  'Every source_urls entry in field_provenance, positioning and opportunity_signals must match a sources[].url in the same candidate. A homepage and an about page are different URLs.',
  'Use real supporting sources. Never invent a source, retrieval date or evidence, or relabel a claim just to pass validation.',
  'Validation checks format and evidence references, not factual accuracy, duplicates or import authorization. Review warnings and check duplicates separately. Nothing is saved.',
  'If validation is unavailable, say the JSON is unvalidated; do not describe it as ready to import.',
]);

/** Pure dry run of the web importer; no data reads, writes or automatic repair. */
export function validateImportJson(json) {
  const input_bytes=Buffer.byteLength(json,'utf8'),input_sha256=createHash('sha256').update(json,'utf8').digest('hex');
  let remaining=200,remainingBytes=80_000,issues_truncated=false;
  const issues=items=>items.flatMap(item=>{
    if(remaining--<=0){issues_truncated=true;return [];}
    if(item.message.length>512||item.path.length>240)issues_truncated=true;
    const result={path:item.path.slice(0,240),code:item.code,message:item.message.slice(0,512)};
    const size=Buffer.byteLength(JSON.stringify(result),'utf8');
    if(size>remainingBytes){issues_truncated=true;return [];}
    remainingBytes-=size;return [result];
  });
  const base={input_bytes,input_sha256,validation_scope:'Import format and evidence references only; no fact checking, duplicate check or persistence.'};
  try {
    const result=validateResearchImport(json);
    const rows=result.rows.map(row=>({row:row.row,valid:row.errors.length===0,error_count:row.errors.length,warning_count:row.warnings.length,errors:issues(row.errors),warnings:issues(row.warnings)}));
    const valid=result.valid_count===result.count;
    return {...base,valid,count:result.count,valid_count:result.valid_count,invalid_count:result.count-result.valid_count,rows,errors:[],issues_truncated,next_action:valid?'Review warnings; deliver these exact contents. Revalidate after any edit.':'Correct the reported errors in the JSON, then validate the complete file again. Do not deliver it as import-ready.'};
  }catch(error){
    if(![400,413].includes(error.status))throw error;
    const errors=issues(error.issues??[{path:'import',code:error.status===413?'payload_too_large':'invalid_json',message:error.message}]);
    return {...base,valid:false,count:null,valid_count:0,invalid_count:null,rows:[],errors,issues_truncated,next_action:'Correct the JSON envelope or size, then validate the complete file again. Nothing was saved.'};
  }
}
