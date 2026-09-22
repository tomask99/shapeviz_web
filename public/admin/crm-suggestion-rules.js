export const SUGGESTION_RULES={
 MULTIPLE_VIEWS:{title:'Follow up on repeat visits',reason:r=>`${Number(r.visits)} checked sessions in the last 30 days. No pending follow-up; sessions do not necessarily represent different people.`},
 CONTACTED_NOT_VIEWED:{title:'Check delivery or contact another person',reason:(r,c)=>`Last recorded send at least ${c.contactedNoViewDays} days ago. No checked visit recorded on currently linked presentations. This does not prove the presentation was never opened.`},
 MEETING_NEEDS_ACTION:{title:'Plan the next step after meeting',reason:()=> 'Meeting stage with no pending follow-up.'},
 REPLIED_NEEDS_ACTION:{title:'Follow up on reply',reason:()=> 'Replied stage with no pending follow-up.'},
 HOT_LEAD_IDLE:{title:'Follow up on presentation interest',reason:r=>`HOT engagement: ${Number(r.visits)||0} checked visits, ${Number(r.seconds)||0}s active time, ${Number(r.clicks)||0} website clicks in the last 30 days. No pending follow-up.`},
 VIEWED_NO_REPLY:{title:'Follow up after presentation',reason:(r,c)=>`Last checked visit at least ${c.viewedNoReplyDays} days ago (within the 30-day signal window). No reply recorded and no pending follow-up.`},
 QUALIFIED_NOT_CONTACTED:{title:'Make first contact',reason:()=> 'Qualified stage without recorded outreach or checked visits. No pending follow-up.'},
};
