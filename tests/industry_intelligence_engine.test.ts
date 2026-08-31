import { describe, it, expect, beforeEach } from 'vitest';
import { 
  INDUSTRY_PRESET_PROFILES, 
  IndustryType,
  industryProfileSchema 
} from '../src/types/industryIntelligence.js';
import { 
  evaluateDeterministicRules, 
  getTenantIntelligenceProfile, 
  saveTenantIntelligenceProfile,
  calculateIndustryKpis
} from '../src/server/services/industryIntelligenceEngine.js';

describe('B2B Industry Intelligence Engine', () => {

  describe('Industry Profile Presets & Schema Validation', () => {
    it('validates all built-in industry preset configurations against Zod schema', () => {
      const industries: IndustryType[] = [
        'construction',
        'manufacturing',
        'office',
        'logistics',
        'healthcare',
        'mining',
        'oil_gas',
        'aviation',
        'custom'
      ];

      for (const ind of industries) {
        const preset = INDUSTRY_PRESET_PROFILES[ind];
        expect(preset).toBeDefined();
        expect(preset.industry).toBe(ind);
        expect(preset.functionalAreas.length).toBeGreaterThan(0);
        expect(preset.trackedEntities.length).toBeGreaterThan(0);
        expect(preset.kpis.length).toBeGreaterThan(0);
        expect(preset.alertRuleTemplates.length).toBeGreaterThan(0);
        expect(preset.incidentCategories.length).toBeGreaterThan(0);

        // Validate complete profile with tenantId
        const fullProfile = {
          ...preset,
          tenantId: `tenant_${ind}_test`
        };
        const validation = industryProfileSchema.safeParse(fullProfile);
        expect(validation.success, `Schema validation failed for ${ind}: ${JSON.stringify(validation.error?.issues)}`).toBe(true);
      }
    });
  });

  describe('Deterministic Rule Evaluation - Zero Hardcoding & Domain Adaptability', () => {
    it('evaluates Construction tenant profile with construction-specific rules and terminology', () => {
      const profile = {
        ...INDUSTRY_PRESET_PROFILES.construction,
        tenantId: 'tenant_const_corp'
      };

      // 1. Critical Hazard Incursion (Crane Operating Zone)
      const craneResult = evaluateDeterministicRules(profile, {
        tagId: 'TAG-CONST-001',
        location: 'Crane Slewing & Hoisting Perimeter',
        personName: 'Dave Rigger',
        role: 'General Laborer',
        rssi: -55
      });

      expect(craneResult.aiRiskLevel).toBe('CRITICAL');
      expect(craneResult.aiRiskScore).toBeGreaterThanOrEqual(90);
      expect(craneResult.triggeredAlert).not.toBeNull();
      expect(craneResult.triggeredAlert?.title).toContain('Crane Slewing & Hoisting Perimeter Breach Alert');
      expect(craneResult.triggeredAlert?.triggerSiren).toBe(true);
      expect(craneResult.triggeredIncident).not.toBeNull();
      expect(craneResult.triggeredIncident?.severity).toBe('Critical');

      // 2. Dwell Overstay (Foundation Trench)
      const trenchResult = evaluateDeterministicRules(profile, {
        tagId: 'TAG-CONST-002',
        location: 'Foundation Trench & Shoring Pit',
        personName: 'Alex Excavator',
        dwellMinutes: 60, // Limit is 45 min
        rssi: -60
      });

      expect(craneResult.aiAnomaly).not.toBeNull();
      expect(trenchResult.aiRiskLevel).toBe('CRITICAL');
      expect(trenchResult.aiAnomaly?.title).toContain('Extended Dwell Duration in Foundation Trench');
    });

    it('evaluates Manufacturing tenant profile with machine safety interlocks and NO crane references', () => {
      const profile = {
        ...INDUSTRY_PRESET_PROFILES.manufacturing,
        tenantId: 'tenant_auto_plant_4'
      };

      // 1. Robotic Welding Cell Incursion (Unauthorized Operator)
      const cellResult = evaluateDeterministicRules(profile, {
        tagId: 'TAG-MFG-101',
        location: 'Automated Robotic Welding Cell',
        personName: 'Ken Assembly',
        role: 'Line Assembler',
        rssi: -48
      });

      expect(cellResult.aiRiskLevel).toBe('CRITICAL');
      expect(cellResult.aiAnomaly?.title).toBe('Automated Robotic Welding Cell Incursion');
      expect(cellResult.triggeredAlert?.title).toContain('Robotic Welding Cell Breach Alert');
      expect(cellResult.triggeredAlert?.triggerSiren).toBe(true);
      expect(cellResult.triggeredIncident?.title).toContain('Automated Robotic Welding Cell');

      // Strict verification: NO crane or scaffolding terms in manufacturing intelligence
      const jsonStr = JSON.stringify(cellResult).toLowerCase();
      expect(jsonStr).not.toContain('crane');
      expect(jsonStr).not.toContain('scaffold');
      expect(jsonStr).not.toContain('trench');
    });

    it('evaluates Office tenant profile with server room physical security and conference room capacity', () => {
      const profile = {
        ...INDUSTRY_PRESET_PROFILES.office,
        tenantId: 'tenant_apex_tower'
      };

      // 1. Unauthorized Server Room Access
      const dcResult = evaluateDeterministicRules(profile, {
        tagId: 'TAG-OFF-301',
        location: 'Data Center & Critical Server Room',
        personName: 'Sam Marketing',
        role: 'Marketing Associate',
        rssi: -50
      });

      expect(dcResult.aiRiskLevel).toBe('HIGH');
      expect(dcResult.aiAnomaly?.title).toContain('Access Clearance Warning');
      expect(dcResult.triggeredAlert?.category).toBe('Security');
      expect(dcResult.triggeredAlert?.title).toContain('Data Center & Critical Server Room Clearance Alert');

      // 2. Conference Room Overcapacity
      const confResult = evaluateDeterministicRules(profile, {
        tagId: 'TAG-OFF-302',
        location: 'Meeting & Conference Rooms',
        personName: 'Lisa Lead',
        currentOccupancy: 22 // Max capacity is 16
      });

      expect(confResult.aiAnomaly?.title).toContain('Capacity Limit Exceeded in Meeting & Conference Rooms');

      // Strict verification: NO construction terms
      const jsonStr = JSON.stringify(dcResult).toLowerCase();
      expect(jsonStr).not.toContain('crane');
      expect(jsonStr).not.toContain('scaffold');
      expect(jsonStr).not.toContain('excavation');
    });

    it('evaluates Logistics tenant profile with cold chain dwell threshold breaches', () => {
      const profile = {
        ...INDUSTRY_PRESET_PROFILES.logistics,
        tenantId: 'tenant_cold_logistics_hub'
      };

      // Cold Vault continuous dwell exceedance (worker welfare)
      const coldResult = evaluateDeterministicRules(profile, {
        tagId: 'TAG-LOG-501',
        location: 'Cold Chain Controlled Temperature Vault',
        personName: 'Chris Loader',
        role: 'Warehouse Handler',
        dwellMinutes: 55 // Limit is 40 min
      });

      expect(coldResult.aiAnomaly?.title).toContain('Extended Dwell Duration in Cold Chain Controlled Temperature Vault');
      expect(coldResult.triggeredAlert?.title).toContain('Cold Chain Controlled Temperature Vault');

      // Strict verification: NO construction terms
      const jsonStr = JSON.stringify(coldResult).toLowerCase();
      expect(jsonStr).not.toContain('crane');
      expect(jsonStr).not.toContain('scaffold');
    });
  });

  describe('Multi-Tenant Profile Isolation & Persistence', () => {
    it('strictly isolates intelligence profiles between different B2B tenants', async () => {
      const tenantA = 'tenant_aerospace_mfg';
      const tenantB = 'tenant_metro_hospital';

      // Tenant A configures Manufacturing profile
      await saveTenantIntelligenceProfile({
        ...INDUSTRY_PRESET_PROFILES.manufacturing,
        companyName: 'AeroDynamics Propulsion Fab',
        tenantId: tenantA
      }, tenantA);

      // Tenant B configures Healthcare profile
      await saveTenantIntelligenceProfile({
        ...INDUSTRY_PRESET_PROFILES.healthcare,
        companyName: 'City General Trauma Center',
        tenantId: tenantB
      }, tenantB);

      // Fetch profiles
      const profileA = await getTenantIntelligenceProfile(tenantA);
      const profileB = await getTenantIntelligenceProfile(tenantB);

      expect(profileA.industry).toBe('manufacturing');
      expect(profileA.companyName).toBe('AeroDynamics Propulsion Fab');
      expect(profileA.terminology.personnelPlural).toBe('Line Operators');

      expect(profileB.industry).toBe('healthcare');
      expect(profileB.companyName).toBe('City General Trauma Center');
      expect(profileB.terminology.personnelPlural).toBe('Clinical Staff & Patients');

      // Cross-tenant verification: Tenant A never sees Tenant B's healthcare data
      expect(profileA.companyName).not.toBe(profileB.companyName);
      expect(profileA.functionalAreas[0].name).not.toBe(profileB.functionalAreas[0].name);
    });
  });

  describe('Industry KPI Calculation', () => {
    it('calculates deterministic KPIs for the tenant without random data generation', async () => {
      const profile = {
        ...INDUSTRY_PRESET_PROFILES.manufacturing,
        tenantId: 'tenant_kpi_test'
      };

      const kpis = await calculateIndustryKpis(profile, 'tenant_kpi_test');
      expect(Array.isArray(kpis)).toBe(true);
      expect(kpis.length).toBe(profile.kpis.length);

      const congestionKpi = kpis.find(k => k.key === 'line_congestion');
      expect(congestionKpi).toBeDefined();
      expect(congestionKpi?.target).toBe(8);
      expect(congestionKpi?.unit).toBe('%');

      const proximityKpi = kpis.find(k => k.key === 'machine_proximity_events');
      expect(proximityKpi).toBeDefined();
      expect(proximityKpi?.value).toBe(0); // Real value derived from 0 alerts in fresh DB
    });
  });
});
