import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root=path.resolve('.');
const dist=path.join(root,'dist');
const siteUrl=(process.env.SITE_URL||'https://agrocalculator.pp.ua').replace(/\/$/,'');
const catalog=JSON.parse(fs.readFileSync(path.join(root,'src/catalog.json'),'utf8'));
const app=fs.readFileSync(path.join(root,'public/app.js'),'utf8');
const read=(relative)=>fs.readFileSync(path.join(dist,relative),'utf8');
const page=(url)=>read(path.join(url.replace(/^\//,'').replace(/\/$/,''),'index.html'));
const textOf=(html)=>html.replace(/<script\b[\s\S]*?<\/script>/gi,' ').replace(/<style\b[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'");

assert.equal(catalog.calculators.length,100,'The source catalogue must contain 100 calculators');
assert.equal(new Set(catalog.calculators.map(item=>item.slug)).size,100,'Calculator slugs must be unique');
assert.equal(Object.keys(catalog.categories).length,8,'Expected 8 categories');

const home=page('/');
assert.match(home,/<html lang="uk">/,'Homepage must be Ukrainian');
assert.match(home,/<title>Agro Calculator/,'New brand must appear in homepage title');
assert.match(home,/href="\/articles\/"/,'Articles must be linked from navigation');
assert.equal((home.match(/class="calculator-card"/g)||[]).length,8,'Homepage must show only 8 featured calculators');
assert.equal((home.match(/data-search-item=/g)||[]).length,8,'Homepage search must index featured calculators only, not the full catalogue');

const directory=page('/calculators/');
assert.equal((directory.match(/class="calculator-card"/g)||[]).length,100,'The catalogue page must list all calculators');
assert.match(directory,/data-search/,'Catalogue search must be available');

const focusDensities=[];
for(const calculator of catalog.calculators){
  assert.ok(calculator.title&&calculator.description&&calculator.intro&&calculator.formula&&calculator.example,'Calculator must have content: '+calculator.slug);
  assert.ok(calculator.metaTitle&&calculator.metaTitle.length<=60,'SEO title must be 60 characters or fewer: '+calculator.slug);
  assert.ok(calculator.metaDescription&&calculator.metaDescription.length<=160,'SEO description must be 160 characters or fewer: '+calculator.slug);
  assert.ok(Array.isArray(calculator.fields)&&calculator.fields.length,'Calculator must have fields: '+calculator.slug);
  assert.ok(Array.isArray(calculator.faqs)&&calculator.faqs.length>=3,'Calculator must have FAQs: '+calculator.slug);
  const ids=calculator.fields.map(field=>field.id);
  assert.equal(new Set(ids).size,ids.length,'Field IDs must be unique: '+calculator.slug);
  assert.ok(app.includes(`'${calculator.type}'`),'Calculator type must be implemented in app.js: '+calculator.type);
  const html=page(calculator.url);
  assert.match(html,/<html lang="uk">/,'Calculator page must be Ukrainian: '+calculator.slug);
  assert.match(html,/<h1>/,'Calculator page must have an H1: '+calculator.slug);
  assert.match(html,/name="description"/,'Calculator page must have meta description: '+calculator.slug);
  assert.match(html,new RegExp(`<link rel="canonical" href="${siteUrl.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}${calculator.url.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}"`),'Canonical URL missing: '+calculator.slug);
  assert.match(html,/Часті запитання/,'Calculator page must have FAQs: '+calculator.slug);
  assert.match(html,/application\/ld\+json/,'Calculator page must have structured data: '+calculator.slug);
  const text=textOf(html).toLocaleLowerCase('uk');
  const words=text.match(/[\p{L}\p{N}]+/gu)||[];
  const keyword=String(calculator.primaryKeyword||calculator.title).toLocaleLowerCase('uk');
  const occurrences=text.split(keyword).length-1;
  const density=words.length?occurrences/words.length*100:0;
  focusDensities.push({slug:calculator.slug,density,occurrences,words:words.length});
  assert.ok(density>1,`Focus-keyword density must exceed 1%: ${calculator.slug} (${density.toFixed(2)}%)`);
}

const articles=fs.readdirSync(path.join(root,'content/articles')).filter(name=>name.endsWith('.md'));
assert.ok(articles.length>=1,'At least one starter article should be present');
const articleIndex=page('/articles/');
assert.match(articleIndex,/Статті та практичні поради/,'Articles landing page missing');
const publishedArticles=articles.filter(name=>/^published:\s*true\s*$/m.test(fs.readFileSync(path.join(root,'content/articles',name),'utf8')));
for(const filename of publishedArticles){
 const source=fs.readFileSync(path.join(root,'content/articles',filename),'utf8');
 const slug=(source.match(/^slug:\s*(.+)$/m)||[])[1]?.replace(/^['"]|['"]$/g,'')||filename.replace(/\.md$/,'');
 const html=page(`/articles/${slug}/`);
 assert.match(html,/<title>/,'Article title missing: '+slug);
 assert.match(html,/name="description"/,'Article description missing: '+slug);
 assert.match(html,/rel="canonical"/,'Article canonical missing: '+slug);
 assert.match(html,/BreadcrumbList/,'Article breadcrumbs schema missing: '+slug);
 assert.match(html,/property="og:type" content="article"/,'Article Open Graph type missing: '+slug);
 assert.match(html,/name="twitter:card"/,'Article Twitter metadata missing: '+slug);
}

const cmsConfig=fs.readFileSync(path.join(root,'.pages.yml'),'utf8');
for(const field of ['focusKeyword','additionalKeywords','canonicalUrl','robotsIndex','robotsFollow','robotsNoArchive','robotsNoSnippet','robotsNoImageIndex','maxSnippet','maxVideoPreview','maxImagePreview','breadcrumbTitle','schemaType','schemaJson','ogTitle','ogDescription','ogImage','ogUrl','ogType','ogSiteName','ogLocale','twitterCard','twitterTitle','twitterDescription','twitterImage','twitterSite','twitterCreator','metaKeywords','isPillar']){
  assert.match(cmsConfig,new RegExp(`name:\\s*${field}\\b`),'CMS SEO field missing: '+field);
}
const admin=page('/admin/');
assert.match(admin,/<meta name="robots" content="noindex,nofollow">/,'CMS guide must not be indexed');
assert.match(admin,/Pages CMS/,'CMS setup page missing');

const sitemap=read('sitemap.xml');
const sitemapUrls=[...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match=>match[1]);
assert.ok(sitemapUrls.length>=100+8+5,'Sitemap must include the homepage, directory, categories, pages and calculators');
assert.equal(new Set(sitemapUrls).size,sitemapUrls.length,'Sitemap URLs must be unique');
assert.ok(sitemapUrls.every(url=>url.startsWith(siteUrl+'/')),'All sitemap URLs must use the configured production domain');
assert.ok(sitemapUrls.includes(siteUrl+'/sitemap.xml')===false,'The sitemap must not list itself');
assert.ok(sitemapUrls.includes(siteUrl+'/articles/'),'Articles landing page must be in sitemap');
assert.ok(sitemapUrls.some(url=>url.includes('/articles/')&&url!==siteUrl+'/articles/'),'Published article must be in sitemap');
assert.ok(!sitemapUrls.includes(siteUrl+'/admin/'),'Noindex CMS page must not be in sitemap');
const robots=read('robots.txt');
assert.match(robots,new RegExp(`Sitemap: ${siteUrl.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\/sitemap\\.xml`),'robots.txt must point to the root sitemap');

for(const relative of ['index.html','calculators/index.html','articles/index.html','admin/index.html','404.html','manifest.webmanifest','robots.txt','sitemap.xml','assets/app.js','assets/site.css','assets/favicon.svg','assets/social-card.svg']){
  assert.ok(fs.existsSync(path.join(dist,relative)),'Missing generated output: '+relative);
}
const generatedFiles=[];
function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())walk(file);else generatedFiles.push(file);}}
walk(dist);
for(const file of generatedFiles){
 const ext=path.extname(file);
 if(['.html','.xml','.txt','.webmanifest'].includes(ext)){
  const content=fs.readFileSync(file,'utf8');
  assert.doesNotMatch(content,/example\.com/i,'Example domain must not appear in generated files: '+path.relative(dist,file));
  assert.doesNotMatch(content,/розрахуй(?:<|\.|,|\s|")/iu,'Old brand must not appear in generated files: '+path.relative(dist,file));
 }
}

const minimum=Math.min(...focusDensities.map(item=>item.density));
console.log(`Validated ${catalog.calculators.length} calculator pages, ${catalog.categories?Object.keys(catalog.categories).length:0} categories, ${publishedArticles.length} published article(s) and ${sitemapUrls.length} sitemap URLs.`);
console.log(`Minimum focus keyword density: ${minimum.toFixed(2)}%.`);
