import PDFDocument from 'pdfkit';
import {readFile} from 'node:fs/promises';
import {clockTime,euro,earnedCents} from '../../public/admin/time-values.js';

export function timeReportFilename(report){
 const slug=report.project.name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,80)||'project';
 return `${slug}-time-report-${report.from||'all'}-${report.to||report.generatedAt.slice(0,10)}.pdf`;
}

export function reportTotals(items,rate){
 const totals={tracked:0,manual:0,earned:0n,open:0,openEarned:0n,completed:0};
 for(const row of items){
  const seconds=Number(row.duration_seconds),value=BigInt(earnedCents(seconds,rate));
  if(row.status!=='finished'){totals.open+=seconds;totals.openEarned+=value;continue;}
  totals[row.source==='Manual'?'manual':'tracked']+=seconds;totals.earned+=value;totals.completed++;
 }
 return totals;
}

export async function renderTimeReport(report){
 const font=await readFile(new URL('../../assets/fonts/NotoSans-Regular.ttf',import.meta.url));
 const doc=new PDFDocument({size:'A4',margins:{top:76,bottom:64,left:44,right:44},font,
  info:{Title:`${report.project.name} - Time report`,Author:'SHAPEVIZ',Subject:'Project time and earnings'}});
 const chunks=[];
 const output=new Promise((resolve,reject)=>{doc.on('data',chunk=>chunks.push(chunk));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);});
 const width=doc.page.width-88,ink='#202428',muted='#5c6268',accent='#896337';let page=0,textSize=10,textColor=ink;
 const text=(value,size=10,color=ink)=>{textSize=size;textColor=color;return doc.fontSize(size).fillColor(color).text(String(value),44,doc.y,{width,lineGap:3});};
 const stamp=value=>new Date(value).toLocaleString('en-GB',{timeZone:report.timeZone,dateStyle:'medium',timeStyle:'medium'});
 function decorate(){
  page++;doc.save();doc.rect(0,0,doc.page.width,52).fill('#171819');
  doc.fontSize(12).fillColor('#ffffff').text('SHAPEVIZ',44,18,{lineBreak:false});
  doc.fontSize(9).fillColor('#d7ba91').text('PROJECT TIME REPORT',300,20,{width:width-256,align:'right',lineBreak:false});
  doc.fontSize(8).fillColor(muted).text('Time report | Not an invoice',44,doc.page.height-37,{lineBreak:false});
  doc.text(`Page ${page}`,doc.page.width-100,doc.page.height-37,{lineBreak:false});doc.restore();doc.fontSize(textSize).fillColor(textColor);doc.x=44;doc.y=76;
 }
 const room=height=>{if(doc.y+height>doc.page.height-64)doc.addPage();};
 doc.on('pageAdded',decorate);decorate();
 text(report.company.company_name,11,accent);doc.moveDown(.4);text(report.project.name,24);doc.moveDown(.5);
 text(`Period: ${report.from||'Beginning'} to ${report.to||'Latest recorded work'}`);
 text(`Generated: ${stamp(report.generatedAt)} | ${report.timeZone}`,9,muted);doc.moveDown();
 const rate=report.project.hourly_rate_cents,totals=reportTotals(report.items,rate);
 const metrics=[['Hourly rate',`${euro(rate)}/h`],['Tracked time',clockTime(totals.tracked)],['Manual time',clockTime(totals.manual)],['Total worked',clockTime(totals.tracked+totals.manual)],['Earned value',euro(totals.earned)]];
 room(160);
 for(const [label,value] of metrics){const y=doc.y;doc.rect(44,y,width,27).fill(label==='Earned value'?'#eee5d9':'#f4f5f5');doc.fontSize(10).fillColor(ink).text(label,54,y+6,{width:150,lineBreak:false});doc.text(value,210,y+6,{width:width-176,align:'right',lineBreak:false});doc.y=y+29;}
 doc.y+=12;
 text('Completed entries only. Values use the current project hourly rate, rounded per entry. Earned value is separate from invoices and payments.',9,muted);
 text('Date filters include entries with work in the period. Each included entry contributes its full active duration; pauses are excluded.',9,muted);
 if(report.items.some(row=>row.status!=='finished')){doc.moveDown(.5);text(`Open timers (excluded from totals): ${clockTime(totals.open)} | ${euro(totals.openEarned)} estimated at export.`,10,accent);}
 doc.moveDown();room(100);text(`Time entries (${report.items.length})`,16);doc.moveDown(.5);
 if(!report.items.length)text('No time entries in this period.',10,muted);
 for(const row of report.items){
  room(112);const y=doc.y;doc.moveTo(44,y).lineTo(44+width,y).lineWidth(.5).stroke('#d9dcde');doc.y=y+10;
  const open=row.status!=='finished';
  text(`${row.source} | ${open?row.status+' - estimated':'Completed'}`,10,accent);
  text(`${clockTime(row.duration_seconds)} worked | ${euro(earnedCents(row.duration_seconds,rate))}${open?' estimated':''}`,12);
  if(row.source==='Manual')text(`Work date: ${row.work_date}${row.work_time?' | Start: '+row.work_time.slice(0,5)+' ('+row.time_zone+')':' | Start time not recorded'}`,9,muted);
  else text(`Start: ${stamp(row.started_at)} | End: ${row.ended_at?stamp(row.ended_at):'Still open'}`,9,muted);
  if(row.description){doc.moveDown(.3);text(row.description,10);}
  doc.moveDown(.8);
 }
 doc.end();return output;
}
