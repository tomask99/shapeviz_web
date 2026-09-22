import {fail,choice} from './validation.js';
import {instant} from './followups.js';
export function actionCenterInput(params){
 const today=instant(params.get('today')),tomorrow=instant(params.get('tomorrow'));
 const hours=(Date.parse(tomorrow)-Date.parse(today))/3600000;
 if(hours<22||hours>26)throw fail(400,'Invalid local day boundaries.');
 const page=Number(params.get('page')||1);
 if(!Number.isInteger(page)||page<1||page>10000)throw fail(400,'Invalid page.');
 return {p_today:today,p_tomorrow:tomorrow,p_group:params.get('group')?choice(params.get('group'),['overdue','today'],'group'):null,p_page:page};
}
