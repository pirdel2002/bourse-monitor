import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {hashPassword,verifyPassword,SecretVault,encryptBackup,decryptBackup,AuthService} from '../src/security.js';
import {openDatabase} from '../src/db.js';

test('password hashing and verification are deterministic only for verification',()=>{const hash=hashPassword('a-strong-password');assert.equal(verifyPassword('a-strong-password',hash),true);assert.equal(verifyPassword('wrong-password',hash),false);assert.notEqual(hash,hashPassword('a-strong-password'));});
test('vault encrypts runtime secrets and decrypts them',()=>{const vault=new SecretVault('server-secret');const encrypted=vault.encrypt({token:'123:abc'});assert.equal(encrypted.includes('123:abc'),false);assert.deepEqual(vault.decrypt(encrypted),{token:'123:abc'});});
test('portable backup is encrypted and protected by passphrase',()=>{const blob=encryptBackup({hello:'world'},'backup-password');assert.equal(blob.toString().includes('world'),false);assert.deepEqual(decryptBackup(blob,'backup-password'),{hello:'world'});assert.throws(()=>decryptBackup(blob,'wrong-password'));});
test('remembered sessions survive an auth service restart and are revocable',()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bourse-auth-')),db=openDatabase(path.join(dir,'x.db')),first=new AuthService(db,'a-strong-password'),session=first.login('a-strong-password',true);assert.equal(session.expiresIn,30*86400);assert.equal(new AuthService(db,'a-strong-password').authorized(session.token),true);first.logout(session.token);assert.equal(first.authorized(session.token),false);db.close();});
