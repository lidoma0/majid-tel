// ساخت کلید امضای اپ اندروید (PKCS12) — فقط یک بار اجرا می‌شود.
// خروجی: majidtel-release.p12 و majidtel-keystore.txt (رمز). این دو فایل را جای امن نگه دارید:
// بدون این کلید، نسخه‌های بعدی اپ روی نسخه نصب‌شده آپدیت نمی‌شوند.
import fs from 'node:fs';
import crypto from 'node:crypto';
import forge from 'node-forge';

const out = 'majidtel-release.p12';
if (fs.existsSync(out)) { console.log('keystore already exists'); process.exit(0); }
const password = crypto.randomBytes(18).toString('base64url');
const alias = 'majidtel';
const keys = forge.pki.rsa.generateKeyPair(2048);
const cert = forge.pki.createCertificate();
cert.publicKey = keys.publicKey;
cert.serialNumber = '01' + crypto.randomBytes(8).toString('hex');
cert.validity.notBefore = new Date();
cert.validity.notAfter = new Date(); cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 40);
const attrs = [{ name: 'commonName', value: 'Majid Tel' }, { name: 'organizationName', value: 'Majid Tel' }, { name: 'countryName', value: 'IR' }];
cert.setSubject(attrs); cert.setIssuer(attrs);
cert.sign(keys.privateKey, forge.md.sha256.create());
const p12 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], password, { friendlyName: alias, algorithm: '3des' });
fs.writeFileSync(out, Buffer.from(forge.asn1.toDer(p12).getBytes(), 'binary'));
fs.writeFileSync('majidtel-keystore.txt', `alias: ${alias}\npassword: ${password}\n`);
console.log('created', out);
