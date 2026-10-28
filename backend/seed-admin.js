import 'dotenv/config';
import { MongoClient } from 'mongodb';
import argon2 from 'argon2';
const email=String(process.env.ADMIN_EMAIL||'').trim().toLowerCase();
const password=String(process.env.ADMIN_INITIAL_PASSWORD||'');
if(!email||!password||password.length<12)throw new Error('Set ADMIN_EMAIL and a 12+ character ADMIN_INITIAL_PASSWORD in backend/.env first.');
const client=new MongoClient(process.env.MONGODB_URI||'mongodb://127.0.0.1:27017',{family:4,autoSelectFamily:false});try{
 await client.connect();
 const users=client.db(process.env.MONGODB_DB||'rootrise').collection('users');
 await users.createIndex({email:1},{unique:true});
 if(await users.findOne({email}))throw new Error('That email already has an account. Choose a new, verified owner email for ADMIN_EMAIL.');
 const passwordHash=await argon2.hash(password,{type:argon2.argon2id,memoryCost:19456,timeCost:2,parallelism:1});
 await users.insertOne({email,passwordHash,name:'RootRise Administrator',farm:'',role:'admin',consentAt:null,createdAt:new Date(),updatedAt:new Date()});
 console.log(`Administrator account created for ${email}. Only an Argon2id password hash is stored.`);
}finally{await client.close()}
