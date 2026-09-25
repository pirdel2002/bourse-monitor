import {createCipheriv,createDecipheriv,createHash,randomBytes,scryptSync,timingSafeEqual} from 'node:crypto';

const safeEqual=(a,b)=>{const aa=Buffer.from(String(a||''));const bb=Buffer.from(String(b||''));return aa.length===bb.length&&aa.length>0&&timingSafeEqual(aa,bb);};

export function hashPassword(password){
  if(String(password||'').length<10)throw new Error('رمز عبور باید حداقل ۱۰ نویسه داشته باشد.');
  const salt=randomBytes(16);const digest=scryptSync(String(password),salt,32);
  return `scrypt$${salt.toString('base64url')}$${digest.toString('base64url')}`;
}

export function verifyPassword(password,encoded){
  try{const [kind,salt,digest]=String(encoded||'').split('$');if(kind!=='scrypt'||!salt||!digest)return false;return safeEqual(scryptSync(String(password),Buffer.from(salt,'base64url'),32),Buffer.from(digest,'base64url'));}catch{return false;}
}

function keyFromSecret(secret){return createHash('sha256').update(String(secret||'')).digest();}

export class SecretVault{
  constructor(secret){if(!secret)throw new Error('APP_ENCRYPTION_KEY یا ADMIN_TOKEN برای رمزگذاری تنظیمات لازم است.');this.key=keyFromSecret(secret);}
  encrypt(value){const iv=randomBytes(12);const cipher=createCipheriv('aes-256-gcm',this.key,iv);const data=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);return `v1.${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${data.toString('base64url')}`;}
  decrypt(value){if(!value)return null;const [version,iv,tag,data]=String(value).split('.');if(version!=='v1')throw new Error('نسخه رمزگذاری تنظیمات شناخته نشد.');const decipher=createDecipheriv('aes-256-gcm',this.key,Buffer.from(iv,'base64url'));decipher.setAuthTag(Buffer.from(tag,'base64url'));return JSON.parse(Buffer.concat([decipher.update(Buffer.from(data,'base64url')),decipher.final()]).toString('utf8'));}
}

export function encryptBackup(payload,password){
  if(String(password||'').length<10)throw new Error('گذرواژه فایل پشتیبان باید حداقل ۱۰ نویسه داشته باشد.');
  const salt=randomBytes(16),iv=randomBytes(12),key=scryptSync(String(password),salt,32),cipher=createCipheriv('aes-256-gcm',key,iv);
  const data=Buffer.concat([cipher.update(JSON.stringify(payload),'utf8'),cipher.final()]);
  return Buffer.from(JSON.stringify({format:'bourse-monitor-backup',version:1,kdf:'scrypt',cipher:'aes-256-gcm',salt:salt.toString('base64url'),iv:iv.toString('base64url'),tag:cipher.getAuthTag().toString('base64url'),data:data.toString('base64url')}),'utf8');
}

export function decryptBackup(buffer,password){
  let pack;try{pack=JSON.parse(Buffer.from(buffer).toString('utf8'));}catch{throw new Error('فایل پشتیبان معتبر نیست.');}
  if(pack?.format!=='bourse-monitor-backup'||pack.version!==1)throw new Error('نسخه فایل پشتیبان پشتیبانی نمی‌شود.');
  try{const key=scryptSync(String(password),Buffer.from(pack.salt,'base64url'),32),decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(pack.iv,'base64url'));decipher.setAuthTag(Buffer.from(pack.tag,'base64url'));return JSON.parse(Buffer.concat([decipher.update(Buffer.from(pack.data,'base64url')),decipher.final()]).toString('utf8'));}catch{throw new Error('گذرواژه اشتباه است یا فایل پشتیبان آسیب دیده است.');}
}

export class AuthService{
  constructor(db,bootstrapPassword){this.db=db;this.bootstrapPassword=String(bootstrapPassword||'');this.sessions=new Map();this.reset=null;this.lastResetRequest=0;if(!this.db.getCredential()&&this.bootstrapPassword)this.db.setCredential(hashPassword(this.bootstrapPassword));}
  hasCustomPassword(){return Boolean(this.db.getCredential());}
  validPassword(password){const stored=this.db.getCredential();return stored?verifyPassword(password,stored.password_hash):safeEqual(password,this.bootstrapPassword);}
  login(password){if(!this.validPassword(password))return null;const token=randomBytes(32).toString('base64url');this.sessions.set(createHash('sha256').update(token).digest('hex'),Date.now()+12*60*60*1000);return token;}
  authorized(token){const key=createHash('sha256').update(String(token||'')).digest('hex'),expires=this.sessions.get(key);if(!expires)return false;if(expires<Date.now()){this.sessions.delete(key);return false;}return true;}
  logout(token){this.sessions.delete(createHash('sha256').update(String(token||'')).digest('hex'));}
  setPassword(password){this.db.setCredential(hashPassword(password));this.sessions.clear();}
  requestReset(){if(Date.now()-this.lastResetRequest<60_000)throw new Error('برای درخواست کد جدید یک دقیقه صبر کنید.');this.lastResetRequest=Date.now();const code=String(Math.floor(100000+Math.random()*900000));this.reset={hash:createHash('sha256').update(code).digest('hex'),expires:Date.now()+10*60*1000,attempts:0};return code;}
  completeReset(code,newPassword){if(!this.reset||this.reset.expires<Date.now())throw new Error('کد بازیابی منقضی شده است.');this.reset.attempts++;if(this.reset.attempts>5){this.reset=null;throw new Error('تعداد تلاش‌های بازیابی بیش از حد مجاز است.');}const valid=safeEqual(createHash('sha256').update(String(code||'')).digest('hex'),this.reset.hash);if(!valid)throw new Error('کد بازیابی معتبر نیست.');this.setPassword(newPassword);this.reset=null;}
}
