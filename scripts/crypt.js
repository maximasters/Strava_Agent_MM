import fs from 'fs/promises';
import crypto from 'crypto';

const algorithm = 'aes-256-cbc';

async function encrypt(inputFile, outputFile, passphrase) {
    // Generate key from passphrase using scrypt
    const key = crypto.scryptSync(passphrase, 'strava-salt', 32);
    const iv = crypto.randomBytes(16);
    
    const data = await fs.readFile(inputFile);
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
    
    // Save IV + Encrypted Data to the output file
    await fs.writeFile(outputFile, Buffer.concat([iv, encrypted]));
    console.log(`Successfully encrypted ${inputFile} to ${outputFile}`);
}

async function decrypt(inputFile, outputFile, passphrase) {
    const key = crypto.scryptSync(passphrase, 'strava-salt', 32);
    
    const data = await fs.readFile(inputFile);
    const iv = data.subarray(0, 16);
    const encrypted = data.subarray(16);
    
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    
    await fs.writeFile(outputFile, decrypted);
    console.log(`Successfully decrypted ${inputFile} to ${outputFile}`);
}

const [,, mode, input, output, pass] = process.argv;

if (!mode || !input || !output || !pass) {
    console.error('Usage: node scripts/crypt.js <encrypt|decrypt> <input> <output> <passphrase>');
    process.exit(1);
}

try {
    if (mode === 'encrypt') {
        await encrypt(input, output, pass);
    } else if (mode === 'decrypt') {
        await decrypt(input, output, pass);
    } else {
        console.error(`Invalid mode: ${mode}. Use "encrypt" or "decrypt".`);
        process.exit(1);
    }
} catch (error) {
    console.error(`Operation failed: ${error.message}`);
    process.exit(1);
}
