(function(global){
  const div=(a,b)=>Math.trunc(a/b),mod=(a,b)=>a-Math.trunc(a/b)*b;
  function jalCal(jy,withoutLeap=false){const breaks=[-61,9,38,199,426,686,756,818,1111,1181,1210,1635,2060,2097,2192,2262,2324,2394,2456,3178];let bl=breaks.length,gy=jy+621,leapJ=-14,jp=breaks[0],jm=0,jump=0;if(jy<jp||jy>=breaks[bl-1])throw new Error('سال شمسی خارج از محدوده است.');for(let i=1;i<bl;i++){jm=breaks[i];jump=jm-jp;if(jy<jm)break;leapJ+=div(jump,33)*8+div(mod(jump,33),4);jp=jm;}let n=jy-jp;leapJ+=div(n,33)*8+div(mod(n,33)+3,4);if(mod(jump,33)===4&&jump-n===4)leapJ++;const leapG=div(gy,4)-div((div(gy,100)+1)*3,4)-150, march=20+leapJ-leapG;if(withoutLeap)return {gy,march};if(jump-n<6)n=n-jump+div(jump+4,33)*33;let leap=mod(mod(n+1,33)-1,4);if(leap===-1)leap=4;return {leap,gy,march};}
  function g2d(gy,gm,gd){let d=div((gy+div(gm-8,6)+100100)*1461,4)+div(153*mod(gm+9,12)+2,5)+gd-34840408;d=d-div(div(gy+100100+div(gm-8,6),100)*3,4)+752;return d;}
  function d2g(jdn){let j=4*jdn+139361631;j=j+div(div(4*jdn+183187720,146097)*3,4)*4-3908;const i=div(mod(j,1461),4)*5+308,gd=div(mod(i,153),5)+1,gm=mod(div(i,153),12)+1,gy=div(j,1461)-100100+div(8-gm,6);return {gy,gm,gd};}
  function j2d(jy,jm,jd){const r=jalCal(jy,true);return g2d(r.gy,3,r.march)+(jm-1)*31-div(jm,7)*(jm-7)+jd-1;}
  function d2j(jdn){const g=d2g(jdn),jy=g.gy-621,r=jalCal(jy,false),jdn1f=g2d(g.gy,3,r.march);let k=jdn-jdn1f;if(k>=0){if(k<=185)return {jy,jm:1+div(k,31),jd:mod(k,31)+1};k-=186;}else{const prev=jy-1;k+=179;if(r.leap===1)k++;if(k<0)return d2j(jdn-1);}return {jy,jm:7+div(k,30),jd:mod(k,30)+1};}
  function toJalaali(gy,gm,gd){return d2j(g2d(gy,gm,gd));}
  function toGregorian(jy,jm,jd){return d2g(j2d(jy,jm,jd));}
  function isLeapJalaaliYear(jy){return jalCal(jy,false).leap===0;}
  function monthLength(jy,jm){if(jm<=6)return 31;if(jm<=11)return 30;return isLeapJalaaliYear(jy)?30:29;}
  global.Jalali={toJalaali,toGregorian,isLeapJalaaliYear,monthLength};
})(window);
