import {INDUSTRIES as CRM_INDUSTRIES} from './crm-options.js';

export const RESEARCH_STATUSES = Object.freeze({
  NEW:'New', RESEARCHED:'Researched', NEEDS_REVIEW:'Needs review',
  NEEDS_MORE_RESEARCH:'Needs more research', APPROVED:'Approved',
  REJECTED:'Rejected', DUPLICATE:'Duplicate',
});
export const LEVELS = Object.freeze(['LOW','MEDIUM','HIGH']);
export const FACT_STATUSES = Object.freeze(['VERIFIED','INFERRED','UNKNOWN']);
export const SOURCE_ORIGINS = Object.freeze(['CHATGPT','MANUAL','IMPORT','SIMILAR_COMPANY','ENRICHMENT','OTHER']);
export const SOURCE_TYPES = Object.freeze([
  'Company Website','About Page','Product Page','Contact Page','Professional / Architect Page',
  'Download Page','Instagram','LinkedIn','Press Article','Other Public Source',
]);
export const INDUSTRIES = Object.freeze([...CRM_INDUSTRIES,'Home Accessories','Kitchens','Bathrooms','Materials / Surfaces','Technology']);
export const INDUSTRY_SHORTCUTS = Object.freeze({
  Furniture:'Furniture brands', Shoes:'Shoes brands', Eyewear:'Eyewear brands',
  Lighting:'Lighting brands', Fashion:'Fashion brands', Jewelry:'Jewelry brands',
  'Beauty / Cosmetics':'Beauty brands', 'Consumer Electronics':'Electronics brands',
  'Sports / Outdoor':'Sports / Outdoor brands',
});
export const BUSINESS_TYPES = Object.freeze([
  'Manufacturer','Brand','Retailer','Distributor','Architecture Studio','Interior Design Studio',
  'Developer','Agency','Ecommerce','Showroom','Hospitality Company','Product Design Studio','Other',
]);
export const PRODUCT_CATEGORIES = Object.freeze([
  'Sofas','Armchairs','Chairs','Tables','Beds','Storage','Outdoor Furniture','Office Furniture',
  'Kitchens','Custom Furniture','Pendant Lamps','Floor Lamps','Table Lamps','Architectural Lighting',
  'Decorative Lighting','Outdoor Lighting','Rugs','Textiles','Accessories','Surfaces','Flooring',
  'Sanitary Products','Bathrooms','Sneakers','Boots','Sandals','Formal Shoes','Sports Shoes',
  'Prescription Glasses','Sunglasses','Optical Frames','Clothing','Bags','Watches','Jewelry',
  'Skincare','Makeup','Fragrances','Consumer Electronics','Sports Equipment','Outdoor Gear',
]);
export const MARKET_SEGMENTS = Object.freeze([
  'B2C','B2B','Architects','Interior Designers','Developers','Hospitality','Retail','Ecommerce',
  'Contract / Commercial','Luxury Residential',
]);
export const POSITIONINGS = Object.freeze(['Mass Market','Mid-Market','Mid-Premium','Premium','Luxury','Design-Focused']);
export const OPPORTUNITY_SIGNALS = Object.freeze([
  'LARGE_PRODUCT_CATALOG','PREMIUM_BRAND','DESIGN_FOCUSED','ACTIVE_INSTAGRAM','ACTIVE_SOCIAL_MEDIA',
  'WEAK_PRODUCT_VISUALS','INCONSISTENT_VISUAL_IDENTITY','ARCHITECT_AUDIENCE','DESIGNER_AUDIENCE',
  'MULTIPLE_SHOWROOMS','ECOMMERCE','CUSTOM_PRODUCTS','MULTIPLE_FINISHES','MULTIPLE_FABRICS',
  'FREQUENT_COLLECTIONS','INTERNATIONAL_MARKET','NEW_COLLECTION','DOWNLOAD_SECTION',
  'NO_3D_DOWNLOADS_FOUND','HAS_3D_DOWNLOADS','HAS_CAD_BIM_SECTION','PRODUCT_CONFIGURATOR',
  'STRONG_VISUAL_CONTENT','VIDEO_CONTENT','OTHER',
]);
export const PROVENANCE_FIELDS = Object.freeze([
  'company_name','website','country','city','industry','business_type','product_categories',
  'secondary_categories','market_segments','short_description',
]);

// Suggestions for research, never an automatic Fit score or verified company facts.
export const IDEAL_CLIENT_PROFILES = Object.freeze([
  {
    id:'furniture-manufacturer', name:'Furniture Manufacturer',
    industries:['Furniture'], business_types:['Manufacturer'],
    signals:['LARGE_PRODUCT_CATALOG','CUSTOM_PRODUCTS','MULTIPLE_FABRICS','FREQUENT_COLLECTIONS','ARCHITECT_AUDIENCE'],
    services:['Product CGI','Lifestyle CGI','3D Models for Architects','Social Content','Animation','Art Direction'],
  },
  {
    id:'lighting-brand', name:'Lighting Brand',
    industries:['Lighting'], business_types:['Manufacturer','Brand'],
    signals:['DESIGN_FOCUSED','MULTIPLE_FINISHES','ARCHITECT_AUDIENCE','INTERNATIONAL_MARKET','LARGE_PRODUCT_CATALOG'],
    services:['Product CGI','Lifestyle CGI','3D Models for Architects','Product Animation','Social Content'],
  },
  {
    id:'shoes-brand', name:'Shoes Brand',
    industries:['Shoes'], business_types:['Manufacturer','Brand','Retailer','Ecommerce'],
    signals:['ECOMMERCE','FREQUENT_COLLECTIONS','LARGE_PRODUCT_CATALOG','ACTIVE_SOCIAL_MEDIA','PREMIUM_BRAND'],
    services:['Product CGI','Lifestyle CGI','Product Animation','Social Content','Art Direction'],
  },
  {
    id:'eyewear-brand', name:'Eyewear Brand',
    industries:['Eyewear'], business_types:['Manufacturer','Brand','Retailer','Ecommerce'],
    signals:['DESIGN_FOCUSED','MULTIPLE_FINISHES','ECOMMERCE','PREMIUM_BRAND','NEW_COLLECTION'],
    services:['Product CGI','Lifestyle CGI','Product Animation','Social Content','Art Direction'],
  },
  {
    id:'architecture-interior-studio', name:'Architecture / Interior Studio',
    industries:['Architecture','Interior design'], business_types:['Architecture Studio','Interior Design Studio'],
    signals:['ARCHITECT_AUDIENCE','DESIGNER_AUDIENCE'],
    services:['Archviz','Animation','AI Content','Social Content'],
  },
].map(profile => Object.freeze(Object.fromEntries(Object.entries(profile).map(([key,value]) => [key,Array.isArray(value) ? Object.freeze(value) : value])))));
