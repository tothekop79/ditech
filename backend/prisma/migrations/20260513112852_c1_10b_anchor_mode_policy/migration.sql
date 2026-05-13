-- C1.10b — Collapse AnchorMode to policy enum: 'center' | 'dynamic_tilt'
--
-- Old values: 'center' | 'back_edge' | 'front_edge' | 'near_edge'
-- New values: 'center' | 'dynamic_tilt'
--
-- Mapping policy:
--   dynamic_tilt = bracket/tilt_bracket WITH tilt_projection
--   center       = everything else
--
-- This discards prior user override on anchorMode. From C1.10b onwards,
-- anchorMode is a derived value (mountingType + coverageMode), not a
-- user choice. UI dropdown is replaced by a read-only badge.

-- Audit before
SELECT 'BEFORE' AS phase, "anchorMode", COUNT(*) AS count
FROM "SensorPlacement"
GROUP BY "anchorMode"
ORDER BY "anchorMode";

-- Apply policy
UPDATE "SensorPlacement"
SET "anchorMode" = CASE
  WHEN "mountingType" IN ('bracket', 'tilt_bracket')
   AND "coverageMode" = 'tilt_projection'
    THEN 'dynamic_tilt'
  ELSE 'center'
END;

-- Audit after
SELECT 'AFTER' AS phase, "anchorMode", COUNT(*) AS count
FROM "SensorPlacement"
GROUP BY "anchorMode"
ORDER BY "anchorMode";
