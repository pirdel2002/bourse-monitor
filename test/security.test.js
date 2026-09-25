import test from 'node:test';
import assert from 'node:assert/strict';
import {hashPassword,verifyPassword,SecretVault,encryptBackup,decryptBackup} from '../src/security.js';

test('password hashing and verification are deterministic only for verification',()=>{const hash=hashPassword('a-strong-password');assert.equal(verifyPassword('a-strong-password',hash),true);assert.equal(verifyPassword('wrong-password',hash),false);assert.notEqual(hash,hashPassword('a-strong-password'));});
test('vault encrypts runtime secrets and decrypts them',()=>{const vault=new SecretVault('server-secret');const encrypted=vault.encrypt({token:'123:abc'});assert.equal(encrypted.includes('123:abc'),false);assert.deepEqual(vault.decrypt(encrypted),{token:'123:abc'});});
test('portable backup is encrypted and protected by passphrase',()=>{const blob=encryptBackup({hello:'world'},'backup-password');assert.equal(blob.toString().includes('world'),false);assert.deepEqual(decryptBackup(blob,'backup-password'),{hello:'world'});assert.throws(()=>decryptBackup(blob,'wrong-password'));});
