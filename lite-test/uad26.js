'use strict';
/* =====================================================================
   Field Lite -> TOTAL: UAD 2.6 (MISMO 2.6 GSE) XML for the legacy URAR (Form 1004).

   TOTAL opens it with File > Open UAD XML and builds a report from it, so what was circled and
   written on the field sheet is not typed again. Only the subject property is written; everything
   the field sheet doesn't collect (comps, neighborhood, values...) is left for TOTAL.

   Where each value goes comes from the GSE "UAD Appendix B: Appraisal Forms Mapping" (Form 1004
   rows; the form reference is noted next to each item, e.g. [1-153]). The wording written into
   TOTAL's free-text boxes is in WORDS below - edit it there to change how it reads in the report.
   ===================================================================== */
const UAD26 = (() => {
  // How each circled abbreviation reads in TOTAL's free-text boxes.
  const WORDS = {
    street: {ASPHT: 'Asphalt', CONC: 'Concrete', BRICK: 'Brick', TILE: 'Tile'},
    alley: {ASPHT: 'Asphalt', CONC: 'Concrete', GRASS: 'Grass', DIRT: 'Dirt'},
    shape: {RECT: 'Rectangular', IRREG: 'Irregular', POLY: 'Polygonal', PIE: 'Pie-shaped', CORNER: 'Corner lot'},
    driveway: {BRICK: 'Brick pavers', CONC: 'Concrete', 'ASPH/TIL': 'Asphalt/tile', GRS: 'Grass', GRV: 'Gravel'},
    design: {RANCH: 'Ranch', 'MEDI/VIL': 'Mediterranean', COT: 'Cottage', BNG: 'Bungalow', TWNHSE: 'Townhouse',
             CONTEM: 'Contemporary', CONDO: 'Condominium'},
    walls: {'CON BLK': 'Concrete block', 'WD-STC': 'Wood frame/stucco', 'ALM-VIN': 'Aluminum/vinyl siding', 'CBS/CONC': 'CBS/concrete'},
    roof: {'S-TILE': 'S-tile', 'C-TILE': 'Concrete tile', ASPHT: 'Asphalt shingle', BARREL: 'Barrel tile', METAL: 'Metal', 'C.ROLL': 'Rolled roofing'},
    gutters: {METAL: 'Metal', PVC: 'PVC'},
    window: {'S-HNG': 'Single hung', SLIDNG: 'Sliding', CSMNT: 'Casement', AWN: 'Awning', 'JAL/PIC': 'Jalousie/picture'},
    floors: {TILE: 'Tile', WOOD: 'Wood', 'LAM/VINYL': 'Laminate/vinyl', 'CPT/TER': 'Carpet/terrazzo', 'TRAV/MRBL': 'Travertine/marble'},
    int_walls: {DRYWL: 'Drywall', PLASTR: 'Plaster', PANL: 'Paneling', WOOD: 'Wood'},
    trim: {'WD/TIL': 'Wood/tile'},
    bath: {TILE: 'Tile', LAMNT: 'Laminate', WOOD: 'Wood', TRAV: 'Travertine', MRBL: 'Marble'},
    wainsc: {TILE: 'Tile', 'MRBL/FIBR': 'Marble/fiberglass'},
    fence: {WOOD: 'Wood', ALUM: 'Aluminum', 'CHN.LNK': 'Chain link', PVC: 'PVC', 'CON/BLK': 'Concrete block', IRON: 'Iron', AUTOM: 'automatic gate'},
    patio: {OPEN: 'Open patio', COVD: 'Covered patio', 'WD/ALM': 'Wood/aluminum cover', 'CAN/SCR': 'Screened', 'BLT-IN': 'Built-in',
            ENCLSD: 'Enclosed', TERR: 'Terrace', BALC: 'Balcony'},
    deck: {CONC: 'Concrete', BRICK: 'Brick pavers', TILE: 'Tile', STONE: 'Stone', TRAV: 'Travertine', WOOD: 'Wood', 'ENG WD': 'Engineered wood'},
    pool: {OPEN: 'In-ground, open', 'FLT SCRND': 'Flat screen enclosure', 'DOME SCR': 'Dome screen enclosure', 'HOT TUB': 'Hot tub',
           FIBERGLS: 'Fiberglass', HEATER: 'Heated'},
    entry: {OPEN: 'Open entry', COV: 'Covered entry', 'WD-CNVS': 'Wood/canvas awning', 'ALM-SCR': 'Aluminum screen', 'BLT-IN': 'Built-in'},
    extras: {IRRIG: 'Irrigation', RAMDA: 'Ramada', STRG: 'Storage', GSTHSE: 'Guest house', ALM: 'Alarm', GAZBO: 'Gazebo', BBQ: 'BBQ'},
  };
  // Location / view choices on the sheet -> the GSE's fixed lists (max two each).
  const LOCATION = {RESI: 'Residential', WTR: 'WaterFront', GOLF: 'GolfCourse', 'RD/TRAF': 'BusyRoad', ROAD: ['Other', 'Road']};
  const VIEW = {RESI: 'ResidentialView', WATER: 'WaterView', GOLF: 'GolfCourseView', 'RD/TRAF': 'CityStreetView', COMM: ['Other', 'Commercial']};

  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const UAD = "ExtensionSectionOrganizationName=\"UNIFORM APPRAISAL DATASET\"";
  // el('NAME', {attr: value}, children...) - attributes left undefined/empty are omitted.
  function el(name, attrs, ...kids) {
    kids = kids.flat().filter(Boolean);
    const a = Object.entries(attrs || {}).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => ` ${k}="${esc(v)}"`).join('');
    return kids.length ? `<${name}${a}>${kids.join('')}</${name}>` : `<${name}${a} />`;
  }
  const ext = (name, inner) => el(`${name}_EXTENSION`, null,
    `<${name}_EXTENSION_SECTION ${UAD}>` + el(`${name}_EXTENSION_SECTION_DATA`, null, inner) + `</${name}_EXTENSION_SECTION>`);
  const YN = b => b ? 'Y' : 'N';
  const list = (vals, dict) => vals.map(v => dict[v] || v).join(', ');
  const num = s => { const m = String(s || '').replace(/[$,\s]/g, '').match(/^\d+(\.\d+)?$/); return m ? m[0] : ''; };
  const whole = s => { const n = num(s); return n ? String(Math.round(+n)) : ''; };

  // "12345 SW 123rd St, Miami, FL 33186" -> parts; anything that doesn't parse stays in the street.
  function address(a) {
    const m = String(a || '').trim().match(/^(.*?),\s*([^,]+?),?\s+([A-Za-z]{2})\.?\s+(\d{5}(?:-?\d{4})?)\s*$/);
    return m ? {street: m[1].trim(), city: m[2].trim(), state: m[3].toUpperCase(), zip: m[4]} : {street: String(a || '').trim()};
  }
  // Kitchen / bath update year -> the GSE's timeframe ([e-12], [e-13]).
  function updateDetail(years, inspYear) {
    const ys = years.map(y => (String(y || '').match(/\b(?:19|20)\d{2}\b/) || [])[0]).filter(Boolean).map(Number);
    if (!ys.length) return null;
    const ago = inspYear - Math.max(...ys);
    if (ago > 15) return {desc: 'NotUpdated'};
    return {desc: 'Updated', when: ago < 1 ? 'LessThanOneYearAgo' : ago <= 5 ? 'OneToFiveYearsAgo' : ago <= 10 ? 'SixToTenYearsAgo' : 'ElevenToFifteenYearsAgo'};
  }

  /* d: {sel(fid) -> [option values], txt(id) -> string, date: 'yyyy-mm-dd', gla: number|0}
     Returns {xml, filled: [labels written], skipped: [notes]} */
  function build(d) {
    const S = id => d.sel(id), T = id => (d.txt(id) || '').trim(), has = (id, v) => S(id).includes(v);
    const filled = [], skipped = [];
    const note = (label, v) => { if (v && !(Array.isArray(v) && !v.length)) filled.push(label); return v; };
    const inspYear = +(d.date || '').slice(0, 4) || new Date().getFullYear();

    // ---- Subject [1-6..1-27]
    const ad = address(T('address'));
    note('Address', ad.street);
    const occ = {OWN: 'OwnerOccupied', TEN: 'TenantOccupied', VCT: 'Vacant'}[S('occupant')[0]];
    note('Occupant', occ);
    const hoa = whole(T('hoa_fee')), spc = whole(T('spc_assmt'));
    note('HOA $', hoa); note('Special assessments $', spc);
    if (hoa) skipped.push('HOA $: set per month / per year in TOTAL (not on the field sheet)');

    // ---- Site [1-85..1-127]
    const streetDesc = list(S('street'), WORDS.street), alleyDesc = list(S('alley'), WORDS.alley);
    note('Street', streetDesc || S('street_own')[0]); note('Alley', alleyDesc || S('alley_own')[0]);
    const offsite = (type, desc, own) => ['Public', 'Private'].map(o => el('_OFF_SITE_IMPROVEMENT', {
      _Type: type, _Description: desc, _OwnershipType: o,
      _ExistsIndicator: own ? YN((own === 'PUB') === (o === 'Public')) : undefined}));
    const shapeDesc = list(S('shape'), WORDS.shape); note('Lot shape', shapeDesc);
    const drvDesc = list(S('driveway'), WORDS.driveway); note('Driveway surface', drvDesc);
    // utilities: public box, other box, other description ('None' when there is none)
    const util = (type, pub, other, desc) => (pub || other || desc) &&
      el('SITE_UTILITY', {_Type: type, _PublicIndicator: YN(pub), _NonPublicIndicator: YN(other), _NonPublicDescription: desc});
    let gas = null;
    if (S('gas').length || S('gas_src').length) {
      const pub = has('gas_src', 'CITY') || has('gas_src', 'PUB'), bottle = has('gas_src', 'BOTTLE'), pri = has('gas_src', 'PRI');
      if (has('gas', 'N') && !pub && !bottle && !pri) gas = util('Gas', false, false, 'None');
      else gas = util('Gas', pub, bottle || pri, bottle ? 'Bottled' : pri ? 'Private' : '');
      note('Gas', gas);
    }
    const water = S('water_src').some(v => v === 'CITY' || v === 'WELL*') &&
      util('Water', has('water_src', 'CITY'), has('water_src', 'WELL*'), has('water_src', 'WELL*') ? 'Well' : '');
    const sewer = S('sewer').some(v => v === 'CITY' || v === 'SEPTIC*') &&
      util('SanitarySewer', has('sewer', 'CITY'), has('sewer', 'SEPTIC*'), has('sewer', 'SEPTIC*') ? 'Septic' : '');
    note('Water', water); note('Sewer', sewer);

    // ---- Improvements [1-128..1-219]
    const attach = {DET: 'Detached', ATT: 'Attached', SEMI: 'SemiDetached'}[S('attach')[0]];
    const status = {EXIST: 'Existing', 'U.C.': 'UnderConstruction', PROP: 'Proposed'}[S('imprv')[0]];
    const stories = num(T('stories'));
    const design = list(S('design'), WORDS.design);
    note('Attachment', attach); note('Existing/proposed', status); note('# Stories', stories); note('Design (style)', design);
    const beds = whole(T('t_bed')), fb = whole(T('t_bath')), hb = whole(T('t_half'));
    const baths = fb || hb ? `${fb || 0}.${hb || 0}` : '';
    note('Bedrooms', beds); note('Baths', baths);
    const gla = d.gla ? String(Math.round(d.gla)) : '';
    note('GLA (from sketch)', gla);
    const adu = has('adu', 'ADU');

    const fnd = [];
    if (has('foundation', 'SLAB')) fnd.push(el('FOUNDATION', {_Type: 'Slab', _ExistsIndicator: 'Y'}));
    if (has('foundation', 'CRWL SP*')) fnd.push(el('FOUNDATION', {_Type: 'Crawlspace', _ExistsIndicator: 'Y'}));
    note('Foundation', fnd.length || has('foundation', 'PILINGS'));
    const extDesc = {
      Foundation: has('foundation', 'PILINGS') ? 'Pilings' : '',
      Walls: list([...S('const'), ...S('ext_walls')], WORDS.walls),
      RoofSurface: [list(S('roof'), WORDS.roof), S('roof_upd').length ? 'updated' : ''].filter(Boolean).join(', '),
      GuttersAndDownspouts: list(S('gutters'), WORDS.gutters),
      WindowType: [list(S('window'), WORDS.window), S('window_upd').length ? 'updated' : ''].filter(Boolean).join(', '),
      WindowStormSash: [S('impact').length ? 'Impact' : '', has('hur_pnls', 'Y') ? 'Hurricane panels' : '', S('accd').length ? 'Accordion shutters' : '']
        .filter(Boolean).join(', '),
    };
    const exterior = Object.entries(extDesc).filter(([, v]) => v).map(([t, v]) => el('EXTERIOR_FEATURE', {_Type: t, _Description: v}));
    if (extDesc.Walls) note('Exterior walls', 1); if (extDesc.RoofSurface) note('Roof surface', 1);
    if (extDesc.GuttersAndDownspouts) note('Gutters', 1); if (extDesc.WindowType) note('Window type', 1);
    if (extDesc.WindowStormSash) note('Storm sash / shutters', 1);
    const intDesc = {
      Floors: [list(S('floors'), WORDS.floors), S('floors_upd').length ? 'updated' : ''].filter(Boolean).join(', '),
      Walls: list(S('int_walls').filter(v => v !== 'PICS'), WORDS.int_walls),
      TrimAndFinish: list(S('trim'), WORDS.trim),
      BathroomFloors: [list(S('bath'), WORDS.bath), S('bath_upd').length ? 'updated' : ''].filter(Boolean).join(', '),
      BathroomWainscot: list(S('wainsc'), WORDS.wainsc),
    };
    const interior = Object.entries(intDesc).filter(([, v]) => v).map(([t, v]) => el('INTERIOR_FEATURE', {_Type: t, _ConditionDescription: v}));
    if (interior.length) note('Interior finishes', 1);

    let attic = null;
    if (has('attic', 'N')) attic = el('ATTIC', {_ExistsIndicator: 'N'});
    else if (has('attic', 'Y') || S('attic_type').length)
      attic = el('ATTIC', {_ExistsIndicator: 'Y'},
        has('attic_type', 'DROP STR') && el('ATTIC_FEATURE', {_Type: 'DropStair', _ExistsIndicator: 'Y'}),
        has('attic_type', 'SCUTTLE') && el('ATTIC_FEATURE', {_Type: 'Scuttle', _ExistsIndicator: 'Y'}));
    note('Attic', attic);

    const heating = [], hv = S('hvac');
    if (hv.includes('CENT')) heating.push(el('HEATING', {_Type: 'ForcedWarmAir'}));
    if (hv.includes('DUKLS')) heating.push(el('HEATING', {_Type: 'Other', _TypeOtherDescription: 'Ductless'}));
    const cooling = hv.length ? el('COOLING', {_CentralizedIndicator: YN(hv.includes('CENT')),
      _IndividualIndicator: YN(hv.includes('DUKLS') || hv.includes('UNIT')), _OtherIndicator: 'N'}) : null;
    note('Heating / cooling', hv.length);

    const appl = t => S('appl_' + t).length > 0;
    const kitchen = [];
    [['refrigerator', 'Refrigerator'], ['range', 'RangeOven'], ['dishwasher', 'Dishwasher'], ['disposal', 'Disposal'], ['microwave', 'Microwave']]
      .forEach(([k, t]) => appl(k) && kitchen.push(el('KITCHEN_EQUIPMENT', {_Type: t, _ExistsIndicator: 'Y'})));
    if (appl('washer') || appl('dryer')) kitchen.push(el('KITCHEN_EQUIPMENT', {_Type: 'WasherDryer', _ExistsIndicator: 'Y'}));
    const otherAppl = [['hood', 'Hood'], ['wine', 'Wine cooler'], ['bev_cool', 'Beverage cooler']].filter(([k]) => appl(k)).map(([, n]) => n);
    if (otherAppl.length) kitchen.push(el('KITCHEN_EQUIPMENT', {_Type: 'Other', _ExistsIndicator: 'Y', _TypeOtherDescription: otherAppl.join(', ')}));
    note('Appliances', kitchen.length);

    const amen = [];
    const fpN = whole(T('fireplace_n'));
    if (S('fireplace').length || fpN) amen.push(el('AMENITY', {_Type: 'Fireplace', _ExistsIndicator: 'Y', _Count: fpN || '1'}));
    const patioDesc = [list(S('patio'), WORDS.patio), S('deck').length ? 'Deck: ' + list(S('deck'), WORDS.deck) : ''].filter(Boolean).join('; ');
    if (patioDesc) amen.push(el('AMENITY', {_Type: 'Patio', _ExistsIndicator: 'Y', _DetailedDescription: patioDesc}));
    if (S('pool').length) amen.push(el('AMENITY', {_Type: 'Pool', _ExistsIndicator: 'Y', _DetailedDescription: list(S('pool'), WORDS.pool)}));
    if (S('fence').length) amen.push(el('AMENITY', {_Type: 'Fence', _ExistsIndicator: 'Y', _DetailedDescription: list(S('fence'), WORDS.fence)}));
    const porch = S('entry').filter(v => v !== 'OPEN');
    if (porch.length) amen.push(el('AMENITY', {_Type: 'Porch', _ExistsIndicator: 'Y', _DetailedDescription: list(porch, WORDS.entry)}));
    if (S('extras').length) amen.push(el('AMENITY', {_Type: 'Other', _ExistsIndicator: 'Y', _TypeOtherDescription: list(S('extras'), WORDS.extras)}));
    note('Amenities', amen.length);

    // Car storage [1-195..1-205]
    const parkN = whole(T('park_cars')), dwN = whole(T('driveway_cars'));
    const garage = has('park', 'GARAGE'), carport = has('park', 'CPORT');
    const driveway = S('driveway').length > 0 || !!dwN || has('park', 'OPEN');
    const carAtt = garage || carport ? (has('park', 'DET') ? 'Detached' : has('park', 'ATT') ? 'Attached' : undefined) : undefined;
    let car = null;
    if (garage || carport || driveway)
      car = el('CAR_STORAGE', {_ExistsIndicator: 'Y', _AttachmentType: carAtt},
        driveway && el('CAR_STORAGE_LOCATION', {_Type: 'Driveway', _ExistsIndicator: 'Y', ParkingSpacesCount: dwN}),
        garage && el('CAR_STORAGE_LOCATION', {_Type: 'Garage', _ExistsIndicator: 'Y', ParkingSpacesCount: parkN}),
        carport && el('CAR_STORAGE_LOCATION', {_Type: 'Carport', _ExistsIndicator: 'Y', ParkingSpacesCount: garage ? '' : parkN}));
    note('Car storage', car);
    // Sales grid shorthand for the subject, e.g. "2ga2dw" [2-37]
    const carGrid = car ? [garage && `${parkN || ''}${carAtt === 'Detached' ? 'gd' : 'ga'}`, carport && `${garage ? '' : parkN || ''}cp`,
      driveway && `${dwN || ''}dw`].filter(Boolean).join('') : '';

    // Kitchen / bath updates [e-10..e-13]
    const kit = updateDetail([T('u_kit'), T('kitchen_upd')], inspYear);
    const bth = updateDetail([T('u_mbth'), T('u_bth2'), T('u_bth3'), T('u_bth4')], inspYear);
    if (kit) note('Kitchen update', 1); if (bth) note('Bathroom update', 1);
    const cond = (seq, area, u) => el('CONDITION_DETAIL', {_SequenceIdentifier: seq, GSEImprovementAreaType: area,
      GSEImprovementDescriptionType: u ? u.desc : undefined, GSEEstimateYearOfImprovementType: u ? u.when : undefined});
    const upd15 = kit || bth ? YN([kit, bth].some(u => u && u.desc !== 'NotUpdated')) : undefined;

    // Additional features [1-218]: things on the sheet the 1004 has no box for
    const addl = [
      has('solar', 'Y') && ['Solar panels', has('solar_fin', 'Y') ? 'financed' : has('solar_fin', 'N') ? 'not financed' : '',
        T('solar_time') && 'term ' + T('solar_time'), T('solar_age') && 'age ' + T('solar_age')].filter(Boolean).join(', '),
      S('impact').length && 'Impact windows', has('hur_pnls', 'Y') && 'Hurricane panels', S('accd').length && 'Accordion shutters',
      has('secbars', 'Y') && ['Security bars', {FULL: 'full', PRT: 'partial'}[S('secbars_ext')[0]], has('safe_rel', 'Y') ? 'with safety release' : '']
        .filter(Boolean).join(' '),
      has('storm', 'Y') && 'Storm mitigation features',
      appl('tankless') && 'Tankless water heater',
      S('extras').length && list(S('extras'), WORDS.extras),
      T('ceiling') && 'Ceiling height ' + T('ceiling'),
    ].filter(Boolean).join('; ');
    note('Additional features', addl);

    // Location / view for the subject's sales-grid column [e-5, e-6, e-14, e-15]
    const pick = (vals, map) => vals.map(v => map[v]).filter(Boolean).slice(0, 2).map(v => Array.isArray(v) ? v : [v]);
    const loc = pick(S('location'), LOCATION), view = pick(S('view'), VIEW);
    note('Location factors', loc); note('View factors', view);
    if (loc.length || view.length) skipped.push('Location and view ratings (Neutral/Beneficial/Adverse) are not on the field sheet - set them in TOTAL');
    const notes = T('notes');
    if (notes) note('Notes (to the condition comment)', notes);

    const struct = el('STRUCTURE', {
        LivingUnitCount: '1', _AccessoryUnitExistsIndicator: S('adu').length ? YN(adu) : undefined,
        AttachmentType: attach, BuildingStatusType: status, StoriesCount: stories, _DesignDescription: design,
        TotalBedroomCount: beds, TotalBathroomCount: baths, GrossLivingAreaSquareFeetCount: gla},
      fnd,
      exterior,
      interior,
      heating, cooling,
      kitchen,
      attic,
      amen,
      car,
      (kit || bth) && ext('CONDITION_DETAIL', cond('1', 'Kitchen', kit) + cond('2', 'Bathrooms', bth)),
      upd15 && ext('OVERALL_CONDITION_RATING', el('OVERALL_CONDITION_RATING', {GSEUpdateLastFifteenYearIndicator: upd15})),
      stories && ext('STRUCTURE', el('STRUCTURE_INFORMATION', {GSEStoriesCount: stories})));

    const site = el('SITE', null,
      shapeDesc && el('SITE_FEATURE', {_Type: 'Shape', _Comment: shapeDesc}),
      drvDesc && el('SITE_FEATURE', {_Type: 'Driveway', _Comment: drvDesc}),
      gas, water, sewer);

    const analysis = [
      addl && el('PROPERTY_ANALYSIS', {_Type: 'AdditionalFeatures', _Comment: addl}),
      notes && el('PROPERTY_ANALYSIS', {_Type: 'PropertyCondition', _Comment: notes}),
    ];

    const designGrid = attach && stories && design ? `${{Detached: 'DT', Attached: 'AT', SemiDetached: 'SD'}[attach]}${stories};${design}` : design;
    const hcGrid = [hv.includes('CENT') && 'Central', hv.includes('DUKLS') && 'Ductless', hv.includes('UNIT') && 'Wall/window unit'].filter(Boolean).join('/');
    const porchGrid = [patioDesc, porch.length && list(porch, WORDS.entry)].filter(Boolean).join('; ');
    const adj = (type, desc) => desc && el('SALE_PRICE_ADJUSTMENT', {_Type: type, _Description: desc});
    const subjectGrid = el('COMPARABLE_SALE', {PropertySequenceIdentifier: '0'},
      el('LOCATION', {PropertyStreetAddress: ad.street, PropertyStreetAddress2: ad.city ? `${ad.city}, ${ad.state} ${ad.zip}` : undefined}),
      (beds || baths) && el('ROOM_ADJUSTMENT', {TotalBedroomCount: beds, TotalBathroomCount: baths}),
      adj('DesignStyle', designGrid),
      adj('GrossLivingArea', gla),
      adj('HeatingCooling', hcGrid),
      adj('CarStorage', carGrid),
      adj('PorchDeck', porchGrid),
      loc.length && ext('COMPARISON_LOCATION_DETAIL', loc.map((v, i) => el('COMPARISON_LOCATION_DETAIL',
        {_SequenceIdentifier: String(i + 1), GSELocationType: v[0], GSELocationTypeOtherDescription: v[1]})).join('')),
      view.length && ext('COMPARISON_VIEW_DETAIL', view.map((v, i) => el('COMPARISON_VIEW_DETAIL',
        {_SequenceIdentifier: String(i + 1), GSEViewType: v[0], GSEViewTypeOtherDescription: v[1]})).join('')));

    const xml = '<?xml version="1.0" encoding="utf-8"?>\n' + el('VALUATION_RESPONSE', {MISMOVersionID: '2.6GSE'},
      el('REPORT', {AppraisalFormType: 'FNM1004', _TitleDescription: 'Uniform Residential Appraisal Report', AppraisalFormVersionIdentifier: '2005',
          AppraisalSoftwareProductName: 'Field Lite'},
        el('FORM', {AppraisalReportContentSequenceIdentifier: '1', AppraisalReportContentType: 'AppraisalForm',
          AppraisalReportContentName: 'URAR [UAD Version]', AppraisalReportContentIdentifier: 'UAD Version 9/2011', AppraisalReportContentIsPrimaryFormIndicator: 'Y'})),
      el('PARTIES', null, el('APPRAISER', null, el('INSPECTION', {AppraisalInspectionPropertyType: 'Subject', InspectionDate: d.date}))),
      el('PROPERTY', {_StreetAddress: ad.street, _City: ad.city, _State: ad.state, _PostalCode: ad.zip, _CurrentOccupancyType: occ},
        struct,
        offsite('Street', streetDesc, S('street_own')[0]),
        offsite('Alley', alleyDesc, S('alley_own')[0]),
        site,
        hoa && el('PROJECT', null, el('_PER_UNIT_FEE', {_Amount: hoa})),
        spc && el('_TAX', {_TotalSpecialTaxAmount: spc}),
        analysis,
        ext('PROPERTY', el('PROPERTY_TYPE', {GSE_PUDIndicator: YN(S('pud').length > 0)}))),
      el('VALUATION_METHODS', null, el('SALES_COMPARISON', null, subjectGrid)),
      el('VALUATION', {AppraisalEffectiveDate: d.date}));
    return {xml, filled, skipped};
  }
  return {build, WORDS, address};
})();
