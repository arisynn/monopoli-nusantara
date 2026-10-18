import {money as nusaMoney,nusaText} from './currency.mjs';
export const RULEPACK = {id:'nusantara-c1009-2',name:'Klasik Nusantara · C1009',scale:10,edition:'Hasbro C1009 ©2016, cetakan 2017',maxPlayers:6};
// Auction house rules in base units: 10 units = 1 Nusa.
export const AUCTION_RULES=Object.freeze({minimum:50,increment:50});
export const auctionMinimum = auction => Math.max(AUCTION_RULES.minimum, Math.ceil(((auction?.amount || 0) + AUCTION_RULES.increment)/AUCTION_RULES.increment)*AUCTION_RULES.increment);
export const GROUPS = [
 {name:'Priangan',color:'#b78c67',ids:[1,3]}, {name:'Jawa',color:'#7fc8e9',ids:[6,8,9]},
 {name:'Sumatra',color:'#dc84ba',ids:[11,13,14]}, {name:'Jawa Timur',color:'#ef9b53',ids:[16,18,19]},
 {name:'Nusa Tenggara',color:'#e87570',ids:[21,23,24]}, {name:'Kalimantan',color:'#edce68',ids:[26,27,29]},
 {name:'Indonesia Timur',color:'#63b89a',ids:[31,32,34]}, {name:'Destinasi Ikonik',color:'#7a91ea',ids:[37,39]}
];
const names=['Mulai','Bogor','Dana Umum','Bandung','Pajak Penghasilan','Stasiun Gambir','Yogyakarta','Kesempatan','Semarang','Surabaya','Penjara','Medan','Energi Nusantara','Padang','Palembang','Stasiun Tawang','Malang','Dana Umum','Solo','Banyuwangi','Parkir Bebas','Denpasar','Kesempatan','Lombok','Labuan Bajo','Stasiun Gubeng','Pontianak','Banjarmasin','Air Nusantara','Balikpapan','Masuk Penjara','Makassar','Manado','Dana Umum','Ambon','Stasiun Tugu','Kesempatan','Raja Ampat','Pajak Kemewahan','Jakarta SCBD'];
const certs={
1:[60,2,10,30,90,160,250,50],3:[60,4,20,60,180,320,450,50],
6:[100,6,30,90,270,400,550,50],8:[100,6,30,90,270,400,550,50],9:[120,8,40,100,300,450,600,50],
11:[140,10,50,150,450,625,750,100],13:[140,10,50,150,450,625,750,100],14:[160,12,60,180,500,700,900,100],
16:[180,14,70,200,550,750,950,100],18:[180,14,70,200,550,750,950,100],19:[200,16,80,220,600,800,1000,100],
21:[220,18,90,250,700,875,1050,150],23:[220,18,90,250,700,875,1050,150],24:[240,20,100,300,750,925,1100,150],
26:[260,22,110,330,800,975,1150,150],27:[260,22,110,330,800,975,1150,150],29:[280,24,120,360,850,1025,1200,150],
31:[300,26,130,390,900,1100,1275,200],32:[300,26,130,390,900,1100,1275,200],34:[320,28,150,450,1000,1200,1400,200],
37:[350,35,175,500,1100,1300,1500,200],39:[400,50,200,600,1400,1700,2000,200]
};
export const BOARD=names.map((name,id)=>{
 let group=GROUPS.findIndex(g=>g.ids.includes(id));let d=certs[id];
 if(d) return {id,name,type:'city',group,color:GROUPS[group].color,price:d[0]*10,rents:d.slice(1,7).map(v=>v*10),build:d[7]*10,mortgage:d[0]*5};
 let type=[5,15,25,35].includes(id)?'station':[12,28].includes(id)?'utility':[2,17,33].includes(id)?'community':[7,22,36].includes(id)?'chance':[4,38].includes(id)?'tax':id===0?'start':id===10?'jail':id===20?'parking':'gojail';
 return {id,name,type,group:-1,color:({chance:'#d9b75d',community:'#80bcae',tax:'#ae91bf',station:'#a1b2c5',utility:'#b7c8d3'})[type]||'#cfb87e',price:type==='station'?2000:type==='utility'?1500:0,mortgage:type==='station'?1000:type==='utility'?750:0,tax:id===4?2000:1000};
});
const c=(title,text,effect)=>({title,text:nusaText(text),...effect});
export const DECKS={
 chance:[
 c('Selangkah ke ibu kota','Maju ke Jakarta SCBD.',{move:39}),c('Pulang membawa peluang','Maju ke Mulai dan terima Rp2.000.',{move:0}),
 c('Jelajah Nusa Tenggara','Maju ke Labuan Bajo. Ambil gaji jika melewati Mulai.',{move:24}),c('Bisnis di Sumatra','Maju ke Medan. Ambil gaji jika melewati Mulai.',{move:11}),
 c('Kereta ekspres','Maju ke stasiun terdekat. Bayar dua kali sewa jika dimiliki lawan.',{nearest:'station',rentFactor:2}),c('Tiket perjalanan','Maju ke stasiun terdekat. Bayar dua kali sewa jika dimiliki lawan.',{nearest:'station',rentFactor:2}),
 c('Layanan Nusantara','Maju ke utilitas terdekat. Jika milik lawan, lempar dua dadu dan bayar 10× jumlah dadu × Rp10.',{nearest:'utility',utilityRoll:true}),
 c('Dividen usaha','Terima dividen Rp500.',{money:500}),c('Surat pembebasan','Simpan kartu ini untuk keluar penjara.',{jailCard:true}),
 c('Putar arah','Mundur tiga petak, lalu selesaikan petak tujuan.',{back:3}),c('Pemeriksaan mendadak','Masuk penjara tanpa mengambil gaji.',{jail:true}),
 c('Renovasi lingkungan','Bayar Rp250 per rumah dan Rp1.000 per hotel milikmu.',{repair:[250,1000]}),c('Denda lalu lintas','Bayar Rp150.',{money:-150}),
 c('Perjalanan ke Gambir','Maju ke Stasiun Gambir. Ambil gaji jika melewati Mulai.',{move:5}),c('Ketua paguyuban','Bayar Rp500 kepada setiap pemain lain.',{each:-500}),c('Investasi jatuh tempo','Terima Rp1.500.',{money:1500})
 ],
 community:[
 c('Kembali ke awal','Maju ke Mulai dan terima Rp2.000.',{move:0}),c('Koreksi bank','Terima Rp2.000.',{money:2000}),c('Kunjungan dokter','Bayar Rp500.',{money:-500}),
 c('Karya terjual','Terima Rp500 dari penjualan karya.',{money:500}),c('Surat pembebasan','Simpan kartu ini untuk keluar penjara.',{jailCard:true}),c('Pemeriksaan rutin','Masuk penjara tanpa mengambil gaji.',{jail:true}),
 c('Dana liburan','Terima Rp1.000.',{money:1000}),c('Pengembalian pajak','Terima Rp200.',{money:200}),c('Selamat ulang tahun','Terima Rp100 dari setiap pemain lain.',{each:100}),
 c('Asuransi jatuh tempo','Terima Rp1.000.',{money:1000}),c('Biaya rumah sakit','Bayar Rp1.000.',{money:-1000}),c('Biaya pendidikan','Bayar Rp500.',{money:-500}),
 c('Honor konsultasi','Terima Rp250.',{money:250}),c('Perbaikan jalan','Bayar Rp400 per rumah dan Rp1.150 per hotel milikmu.',{repair:[400,1150]}),
 c('Lomba budaya','Terima hadiah Rp100.',{money:100}),c('Warisan keluarga','Terima Rp1.000.',{money:1000})
 ]
};
export const PAWNS=[{name:'Kapal',symbol:'⛵',color:'#ecbc67'},{name:'Komodo',symbol:'◆',color:'#92bfa9'},{name:'Becak',symbol:'♧',color:'#c6a0d8'},{name:'Cenderawasih',symbol:'✦',color:'#7bbbd9'},{name:'Kapal Senja',symbol:'◈',color:'#e58c7d'},{name:'Komodo Emas',symbol:'✧',color:'#d6c76a'}];
export const money=nusaMoney;
