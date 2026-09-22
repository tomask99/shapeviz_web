import test from 'node:test';
import assert from 'node:assert/strict';
import {formatPipelineEUR,pipelineValueMarkup} from '../public/admin/crm-pipeline-value.js';
const fixture=()=>({currency:'EUR',one_time:{amount:'3000.25',count:2},monthly:{amount:'0',count:1},missing_count:2,unknown_frequency_count:1});
test('pipeline totals format exact cents including values beyond safe integer precision',()=>{
 assert.equal(formatPipelineEUR('9007199254740993.27','en-US'),'€9,007,199,254,740,993.27');
 assert.equal(formatPipelineEUR('0.01','en-US'),'€0.01');
 assert.equal(formatPipelineEUR('1234.5','sk-SK'),'1\u00a0234,50\u00a0€');
 for(const v of [1,'-1','1e3','1.001','NaN','<img>'])assert.throws(()=>formatPipelineEUR(v));
});
test('pipeline summary distinguishes zero estimates from missing and invalid data',()=>{
 const v=fixture();let html=pipelineValueMarkup(v);
 assert.match(html,/One-time pipeline/);assert.match(html,/Monthly opportunities/);assert.match(html,/0[.,]00.*month/);assert.match(html,/2 without an amount; 1 with an amount/);
 v.monthly.count=0;html=pipelineValueMarkup(v);assert.match(html,/Not estimated/);
 for(const bad of [undefined,{}, {...fixture(),currency:'USD'},{...fixture(),missing_count:-1},{...fixture(),one_time:{amount:'<script>',count:1}},{...fixture(),one_time:{amount:'100',count:0}}]){
  html=pipelineValueMarkup(bad);assert.match(html,/unavailable/);assert.doesNotMatch(html,/data-value-kind|<script>/);
 }
});
