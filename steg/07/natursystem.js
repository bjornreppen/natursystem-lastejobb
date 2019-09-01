const { io, json, log } = require("lastejobb");

const r = {};

flett("ar_diagnostisk_art");
flett("na_med_basistrinn_relasjon");
flett("na_mi_liste");
flett("mi_variasjon");
flett("na_prosedyrekategori");
flett("na_definisjonsgrunnlag");
flettKildedata("nin-data/Natur_i_Norge/Natursystem/type");
flettKildedata("nin-data/Natur_i_Norge/Natursystem/Miljøvariabler/type");
flettKildedata(
  "nin-data/Natur_i_Norge/Natursystem/Beskrivelsessystem/Regional_naturvariasjon/type"
);

sjekkAtTitlerEksisterer();
capsTitler();
kobleForeldre();
overrideDefects();
propagerNedFlaggAttributt();

// På sedimentsortering er det innført et ekstra tullenivå som bryter med systemet
// For å unngå en heap av trøbbel justerer vi kodene inn rett under LKM og dropper
// mellomnivået
function overrideDefects() {
  const koder = ["NN-NA-LKM-S3-E", "NN-NA-LKM-S3-F", "NN-NA-LKM-S3-S"];
  Object.keys(r).forEach(kode => {
    const node = r[kode];
    koder.forEach(m => {
      if (node.relasjon) {
        const node = r[kode];
        node.relasjon.forEach(rel => {
          rel.kode = rel.kode.replace("NN-NA-LKM-S3-", "NN-NA-LKM-S3");
        });
      }
      if (!kode.startsWith(m)) return;
      const destKode = kode.replace("S3-", "S3");
      node.foreldre[0] = kode === m ? "NN-NA-LKM" : m.replace("S3-", "S3");
      json.moveKey(r, kode, destKode);
    });
  });
  delete r["NN-NA-LKM-S3"];
}

function flettAttributter(o) {
  for (let key of Object.keys(o)) {
    let kode = key.replace("_", "-");
    kode = kode.toUpperCase();
    const src = o[key];
    r[kode] = Object.assign({}, r[kode], src);
  }
}

function flett(filename) {
  var data = io.lesDatafil(filename);
  let o = data;
  if (o.items) o = json.arrayToObject(data.items, { uniqueKey: "kode" });
  flettAttributter(o);
}

function flettKildedata(filename) {
  var data = io.readJson(filename + ".json");
  let o = data;
  if (o.items) o = json.arrayToObject(data.items, { uniqueKey: "kode" });
  flettAttributter(o);
}

function finnForeldre(kode) {
  if (kode === "~") return [];
  const segs = splittKode(kode);
  if (segs.length <= 1) return ["~"];
  const len = segs[segs.length - 1].length;
  kode = kode.substring(0, kode.length - len);
  while (kode.length > 0) {
    if (kode in r) return [kode];
    kode = kode.substring(0, kode.length - 1);
  }
  return ["~"];
}

function kobleForeldre() {
  for (let key of Object.keys(r)) {
    const node = r[key];
    if (!node.foreldre) node.foreldre = finnForeldre(key);
  }
}

function propagerNedFlaggAttributt() {
  for (let kode of Object.keys(r)) {
    const node = r[kode];
    for (const fkode of node.foreldre) {
      const foreldernode = r[fkode];
      if (!foreldernode)
        throw new Error(`Forelderen ${fkode} til ${kode} mangler.`);
      if (r[fkode].type === "flagg") node.type = "flagg";
      if (r[fkode].type === "gradient") node.type = "gradientverdi";
    }
    if (kode.startsWith("NN-NA-LKM"))
      if (!node.type) log.warn("Missing type attribute on: " + kode);
  }
}

function capsTitler() {
  for (let key of Object.keys(r)) {
    const tittel = r[key].tittel;
    Object.keys(tittel).forEach(lang => {
      let tit = tittel[lang].replace(/\s+/g, " "); // Fix double space issues in source data
      if (tit) tittel[lang] = tit.replace(tit[0], tit[0].toUpperCase());
      else log.warn("Mangler tittel: ", key);
    });
  }
}

function sjekkAtTitlerEksisterer() {
  const notitle = [];
  for (let key of Object.keys(r)) {
    const node = r[key];
    if (!node.se) {
      if (!node.tittel) {
        log.warn(`Mangler tittel for ${key}: ${JSON.stringify(node)}`);
        notitle.push(key);
      } else {
        node.tittel = Object.entries(node.tittel).reduce((acc, e) => {
          if (!e[1])
            log.warn(`Mangler tittel for ${key}: ${JSON.stringify(node)}`);
          acc[e[0]] = e[1].trim();
          return acc;
        }, {});
        if (r[key].kode) {
          debugger;
          log.warn("Har allerede unødig kode property: ", key);
        }
      }
    }
  }

  if (notitle.length > 0) {
    log.warn("Mangler tittel: " + notitle.join(", "));
    notitle.forEach(key => delete r[key]);
  }
}

// Deler opp koden i ett array av segmenter, 1 for hvert nivå
// tar hensyn til målestokk for NA
// i.e. 'NA-T44-E-1 => ['NA','T','44','E-1']
function splittKode(kode) {
  if (kode && kode.toUpperCase().indexOf("NA") === 0) {
    // HACK: treat C-2, E-1 etc as one level
    let segments = kode.match(/([a-eA-E]-[1-9]+)|[a-zA-Z]+|[0-9]+/g);
    return segments || [];
  }
  let segments = kode.match(/[a-zA-Z]+|[0-9]+/g);
  return segments || [];
}

io.skrivBuildfil(__filename, json.objectToArray(r, "kode"));