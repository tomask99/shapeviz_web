export const CSV_FIELDS=['company_name','website','country','city','industry','description','instagram','linkedin','priority','fit','source','services','contact_name','contact_email','contact_role'];
export function parseCSV(text){
 if(typeof text!=='string'||text.length>80000)throw new Error('Use a CSV of at most 80,000 characters and 200 rows.');text=text.replace(/^\uFEFF/,'');let rows=[],row=[],cell='',quoted=false,closed=false;
 for(let i=0;i<text.length;i++){const ch=text[i];if(quoted){if(ch==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=ch;continue;}
 if(ch==='"'&&!cell&&!closed){quoted=true;continue;}if(ch===','||ch==='\n'||ch==='\r'){row.push(cell);cell='';closed=false;if(ch!==','){if(ch==='\r'&&text[i+1]==='\n')i++;if(row.some(v=>v!==''))rows.push(row);row=[];}continue;}if(closed)throw new Error('Unexpected text after a quoted field.');if(ch==='"')throw new Error('Quote inside an unquoted field.');cell+=ch;}
 if(quoted)throw new Error('Unclosed quoted field.');row.push(cell);if(row.some(v=>v!==''))rows.push(row);
 const header=rows.shift()?.map(v=>v.trim());if(!header?.includes('company_name')||new Set(header).size!==header.length||header.some(k=>!CSV_FIELDS.includes(k)))throw new Error('CSV needs company_name and supported, unique column headers: '+CSV_FIELDS.join(', '));
 if(!rows.length||rows.length>200)throw new Error('Import between 1 and 200 rows per file.');return rows.map((r,i)=>{if(r.length!==header.length)throw new Error('Wrong column count on data row '+(i+1));return Object.fromEntries(header.map((k,j)=>[k,r[j].trim()]));});
}
export function exportCSV(rows,fields=CSV_FIELDS){const safe=v=>{let s=String(v??'');if(/^[\s]*[=+\-@]/.test(s)||/^[\t\r\n]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};return '\uFEFF'+[fields,...rows.map(r=>fields.map(k=>Array.isArray(r[k])?r[k].join('|'):r[k]))].map(r=>r.map(safe).join(',')).join('\r\n');}
