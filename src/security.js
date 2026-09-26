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
  constructor(db,bootstrapPassword){this.db=db;this.bootstrapPassword=String(bootstrapPassword||'');this.lastResetRequests=new Map();let credential=this.db.getCredential();if(!credential&&this.bootstrapPassword){this.db.setCredential(hashPassword(this.bootstrapPassword));credential=this.db.getCredential();}if(credential)this.db.ensureBootstrapUser({username:'admin',displayName:'مدیر سامانه',passwordHash:credential.password_hash});this.db.pruneSessions();}
  hasCustomPassword(){return Boolean(this.db.listUsers().length);}
  validPassword(username,password){const user=this.db.userByUsername(username);return user&&user.active&&verifyPassword(password,user.password_hash)?user:null;}
  login(username,password,remember=false){if(typeof password==='boolean'){remember=password;password=username;username='admin';}const user=this.validPassword(String(username||'admin'),password);if(!user)return null;const token=randomBytes(32).toString('base64url'),ttl=remember?30*86400000:12*60*60*1000;this.db.createSession(this.tokenHash(token),new Date(Date.now()+ttl).toISOString(),remember,user.id);this.db.markUserLogin(user.id);return {token,expiresIn:Math.floor(ttl/1000),user:this.publicUser(user)};}
  tokenHash(token){return createHash('sha256').update(String(token||'')).digest('hex');}
  publicUser(user){return user?{id:Number(user.id),username:user.username,displayName:user.display_name,role:user.role,active:Boolean(user.active)}:null;}
  authorized(token){if(!token)return null;const key=this.tokenHash(token),session=this.db.getSession(key);if(!session||!session.active)return null;if(Date.parse(session.expires_at)<=Date.now()){this.db.deleteSession(key);return null;}if(Date.now()-Date.parse(session.last_used_at)>60*60*1000)this.db.touchSession(key);return this.publicUser({id:session.user_id,username:session.username,display_name:session.display_name,role:session.role,active:session.active});}
  logout(token){this.db.deleteSession(this.tokenHash(token));}
  invalidateSessions(userId=null){if(userId==null)this.db.deleteAllSessions();else this.db.raw.prepare('DELETE FROM admin_sessions WHERE user_id=?').run(userId);}
  setPassword(userId,password){const user=this.db.userById(userId);if(!user)throw new Error('کاربر یافت نشد.');this.db.updateUser(userId,{displayName:user.display_name,role:user.role,active:Boolean(user.active),passwordHash:hashPassword(password)});this.invalidateSessions(userId);}
  createUser(input){const username=String(input.username||'').trim();if(!/^[A-Za-z0-9_.-]{3,40}$/.test(username))throw new Error('نام کاربری باید ۳ تا ۴۰ نویسه لاتین، عدد، نقطه، خط تیره یا زیرخط باشد.');if(this.db.userByUsername(username))throw new Error('این نام کاربری قبلاً استفاده شده است.');const role=input.role==='SENIOR'?'SENIOR':'NORMAL';return this.publicUser(this.db.createUser({username,displayName:String(input.displayName||username).trim().slice(0,80),passwordHash:hashPassword(input.password),role}));}
  updateUser(id,input){const current=this.db.userById(id);if(!current)throw new Error('کاربر یافت نشد.');const passwordHash=input.password?hashPassword(input.password):null;return this.publicUser(this.db.updateUser(id,{displayName:String(input.displayName||current.display_name).trim().slice(0,80),role:input.role==='SENIOR'?'SENIOR':'NORMAL',active:input.active!==false,passwordHash}));}
  requestReset(username){const user=this.db.userByUsername(username);if(!user||!user.active)throw new Error('کاربر فعال یافت نشد.');const last=this.lastResetRequests.get(user.id)||0;if(Date.now()-last<60_000)throw new Error('برای درخواست کد جدید یک دقیقه صبر کنید.');this.lastResetRequests.set(user.id,Date.now());const code=String(Math.floor(100000+Math.random()*900000));this.db.saveResetCode(user.id,createHash('sha256').update(code).digest('hex'),new Date(Date.now()+10*60*1000).toISOString());return {code,user:this.publicUser(user)};}
  completeReset(username,code,newPassword){const user=this.db.userByUsername(username),reset=user?this.db.getResetCode(user.id):null;if(!user||!reset||Date.parse(reset.expires_at)<Date.now())throw new Error('کد بازیابی منقضی شده است.');this.db.incrementResetAttempts(user.id);if(Number(reset.attempts)>=5){this.db.deleteResetCode(user.id);throw new Error('تعداد تلاش‌های بازیابی بیش از حد مجاز است.');}const valid=safeEqual(createHash('sha256').update(String(code||'')).digest('hex'),reset.code_hash);if(!valid)throw new Error('کد بازیابی معتبر نیست.');this.setPassword(user.id,newPassword);this.db.deleteResetCode(user.id);}
}
