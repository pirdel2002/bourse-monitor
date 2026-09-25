function timeParts(date,timeZone){const parts=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date);return Object.fromEntries(parts.filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));}

export class ApiQuota {
  constructor(db,config){this.db=db;this.config=config;}
  reserve(endpoint,date=new Date(),providerId='default'){
    const limits=this.config.endpoints[endpoint];
    if(!limits) throw new Error(`سهمیه endpoint ${endpoint} تعریف نشده است.`);
    const p=timeParts(date,this.config.timeZone); const day=`${p.year}-${p.month}-${p.day}`; const five=String(Math.floor(Number(p.minute)/5)*5).padStart(2,'0');
    const bucket=`${providerId}:${endpoint}`,globalBucket=`${providerId}:__global__`;
    const result=this.db.reserveApi(bucket,[{type:'day',key:day,limit:limits.daily},{type:'5min',key:`${day}T${p.hour}:${five}`,limit:limits.fiveMinutes},{endpoint:globalBucket,type:'global-5min',key:`${day}T${p.hour}:${five}`,limit:this.config.globalFiveMinutes}]);
    if(!result.allowed){const error=new Error(`سهمیه ${endpoint} در بازه ${result.blockedBy} مصرف شده است (${result.used}/${result.limit}).`);error.code='API_QUOTA_EXCEEDED';throw error;}
  }
}
