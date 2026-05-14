import { useState, useCallback, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { designsApi, type SensorPlacement, type CoverageZone, type SensorFunction, type ZoneType, type Point, type CreateSensorDTO, type UpdateSensorDTO, type CreateZoneDTO } from '../api/designs';
import type { SavedMeasure } from '../components/coverage/MeasureTool';

export type Tool = 'select' | 'add-sensor' | 'add-entrance-line' | 'add-engagement' | 'add-heatmap-zone' | 'add-obstruction' | 'add-walking' | 'measure';
export type CoverageMode = 'rectangle' | 'polygon' | 'hide';
export type SensorDisplayMode = 'symbol' | 'image';

export interface UseDesignEditorOptions {
  designId: string;
}

export function useDesignEditor({ designId }: UseDesignEditorOptions) {
  const qc = useQueryClient();

  const designQuery = useQuery({
    queryKey: ['design', designId],
    queryFn: () => designsApi.get(designId),
    enabled: !!designId,
  });

  const [tool, setTool] = useState<Tool>('select');
  const [selectedSensorId, setSelectedSensorId] = useState<string | null>(null);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [selectedMeasureId, setSelectedMeasureId] = useState<string | null>(null);

  // Layout toggles
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);

  const [coverageMode, setCoverageMode] = useState<CoverageMode>('rectangle');
  const [sensorDisplay, setSensorDisplay] = useState<SensorDisplayMode>('symbol');
  const [showOverlap, setShowOverlap] = useState(true);
  const [showUncovered, setShowUncovered] = useState(true);
  const [showLabels, setShowLabels] = useState(true);

  const [pendingPoints, setPendingPoints] = useState<Point[]>([]);
  const [pendingSensorFunction, setPendingSensorFunction] = useState<SensorFunction>('entrance');

  // Measure state
  const [measurePoints, setMeasurePoints] = useState<Point[]>([]);
  const [savedMeasures, setSavedMeasures] = useState<SavedMeasure[]>([]);
  const [pendingMeasureDialog, setPendingMeasureDialog] = useState<{ a: Point; b: Point } | null>(null);

  useEffect(() => {
    setPendingPoints([]);
    setMeasurePoints([]);
  }, [tool]);

  // ── Mutations ──
  const createSensor = useMutation({
    mutationFn: (dto: CreateSensorDTO) => designsApi.sensors.create(designId, dto),
    onSuccess: (newSensor) => {
      qc.invalidateQueries({ queryKey: ['design', designId] });
      setSelectedSensorId(newSensor.id);
      setTool('select');
    },
  });

  const updateSensor = useMutation({
    mutationFn: ({ sensorId, dto }: { sensorId: string; dto: UpdateSensorDTO }) =>
      designsApi.sensors.update(designId, sensorId, dto),
    // C1.10d#1 — Field-scoped merge of server response into cache.
    //   Goal: do NOT clobber optimistic updates of fields the user is still
    //   actively editing. The DB-stale echo of mountingHeight (e.g. 3.5)
    //   used to overwrite the user's optimistic 3, causing RealtimeNumber's
    //   useEffect to resync input="3.5" on top of live keystrokes.
    //   Fix: merge only the fields that were in the mutation's dto, plus the
    //   server-recomputed coverage fields when a coverage-affecting field
    //   (mountingHeight, tiltAngle, coverageMode, cameraModelId) was changed.
    //   Direct invalidateQueries() previously caused the same family of races.
    //   See PROJECT_STATE.md lesson #4 (cache merge pattern).
    onSuccess: (serverSensor: any, { sensorId, dto }) => {
      qc.setQueryData(['design', designId], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          sensors: (old.sensors ?? []).map((s: any) => {
            if (s.id !== sensorId) return s;
            const patch: any = {};
            // Echo back only the fields we asked to change.
            for (const k of Object.keys(dto)) patch[k] = serverSensor[k];
            // Server-recomputed coverage side-effects (see service.ts L488).
            const recomputeKeys = ['mountingHeight', 'tiltAngle', 'coverageMode', 'cameraModelId', 'recomputeCoverage', 'ratioOverride', 'farWidthRatio', 'depthRatio'];
            if (recomputeKeys.some((k) => k in dto)) {
              patch.coverageWidth = serverSensor.coverageWidth;
              patch.coverageDepth = serverSensor.coverageDepth;
              patch.nearEdgeRatio = serverSensor.nearEdgeRatio;
            }
            return { ...s, ...patch };
          }),
        };
      });
    },
  });

  // ── Debounced sensor update (for sliders/sticky inputs) ──
  const debounceTimers = useRef<Record<string, NodeJS.Timeout>>({});
  const updateSensorDebounced = useCallback((sensorId: string, dto: UpdateSensorDTO, delay = 300) => {
    // C1.10d#1 — Key by sensorId + sorted dto keys so that updates to DIFFERENT
    // fields of the SAME sensor don't cancel each other's pending PATCHes.
    // Before: keying by sensorId alone meant ObstructionPanel re-firing
    // {obstructionData} would clearTimeout({mountingHeight}) before it ever
    // hit the network — user-typed mountingHeight never persisted.
    const key = `${sensorId}:${Object.keys(dto).sort().join(',')}`;
    if (debounceTimers.current[key]) clearTimeout(debounceTimers.current[key]);

    // Optimistic update — apply to cache immediately for instant UI feedback
    qc.setQueryData(['design', designId], (old: any) => {
      if (!old) return old;
      return {
        ...old,
        sensors: (old.sensors ?? []).map((s: any) =>
          s.id === sensorId ? { ...s, ...dto } : s,
        ),
      };
    });

    debounceTimers.current[key] = setTimeout(() => {
      updateSensor.mutate({ sensorId, dto });
      delete debounceTimers.current[key];
    }, delay);
  }, [designId, updateSensor, qc]);

  // ── Immediate sensor update (sets local cache + sends API right away) ──
  const updateSensorImmediate = useCallback((sensorId: string, dto: UpdateSensorDTO) => {
    qc.setQueryData(['design', designId], (old: any) => {
      if (!old) return old;
      return {
        ...old,
        sensors: (old.sensors ?? []).map((s: any) =>
          s.id === sensorId ? { ...s, ...dto } : s,
        ),
      };
    });
    updateSensor.mutate({ sensorId, dto });
  }, [designId, updateSensor, qc]);

  const deleteSensor = useMutation({
    mutationFn: (sensorId: string) => designsApi.sensors.delete(designId, sensorId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['design', designId] });
      setSelectedSensorId(null);
    },
  });

  const createZone = useMutation({
    mutationFn: (dto: CreateZoneDTO) => designsApi.zones.create(designId, dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['design', designId] });
      setPendingPoints([]);
      setTool('select');
    },
  });

  const deleteZone = useMutation({
    mutationFn: (zoneId: string) => designsApi.zones.delete(designId, zoneId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['design', designId] });
      setSelectedZoneId(null);
    },
  });

  const recalcDesign = useMutation({
    mutationFn: () => designsApi.recalc(designId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['design', designId] }),
  });

  const updateDesign = useMutation({
    mutationFn: (dto: Parameters<typeof designsApi.update>[1]) => designsApi.update(designId, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['design', designId] }),
  });

  const uploadFloorPlan = useMutation({
    mutationFn: (file: File) => designsApi.uploadFloorPlan(designId, file),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['design', designId] }),
  });

  // ── Canvas click ──
  const handleCanvasClick = useCallback((point: Point, defaultCameraModelId?: string): boolean => {
    if (tool === 'select') {
      setSelectedMeasureId(null);
      return false;
    }

    if (tool === 'measure') {
      const next = [...measurePoints, point];
      if (next.length === 2) {
        setMeasurePoints(next);
        setPendingMeasureDialog({ a: next[0], b: next[1] });
      } else {
        setMeasurePoints(next);
      }
      return true;
    }

    if (tool === 'add-sensor' && defaultCameraModelId) {
      const existingCount = designQuery.data?.sensors?.length ?? 0;
      createSensor.mutate({
        cameraModelId: defaultCameraModelId,
        sensorName: `Sensor${existingCount + 1}`,
        functionType: pendingSensorFunction,
        x: point.x,
        y: point.y,
        mountingHeight: designQuery.data?.ceilingHeight ?? 3.0,
      });
      return true;
    }

    if (tool === 'add-entrance-line') {
      const next = [...pendingPoints, point];
      if (next.length === 2) {
        createZone.mutate({
          zoneType: 'entrance_line',
          name: 'Entrance Line',
          linePoints: next as [Point, Point],
        });
      } else {
        setPendingPoints(next);
      }
      return true;
    }

    if (tool === 'add-engagement' || tool === 'add-heatmap-zone' || tool === 'add-obstruction' || tool === 'add-walking') {
      setPendingPoints([...pendingPoints, point]);
      return true;
    }

    return false;
  }, [tool, pendingPoints, measurePoints, pendingSensorFunction, designQuery.data, createSensor, createZone]);

  const finishPolygon = useCallback(() => {
    if (pendingPoints.length < 3) {
      setPendingPoints([]);
      return;
    }
    let zoneType: ZoneType = 'engagement_area';
    let name = 'Engagement Area';
    if (tool === 'add-heatmap-zone') { zoneType = 'heatmap_area'; name = 'Heatmap Zone'; }
    if (tool === 'add-obstruction') { zoneType = 'obstruction'; name = 'Obstruction'; }
    if (tool === 'add-walking') { zoneType = 'walking_area'; name = 'Walking Area'; }
    createZone.mutate({ zoneType, name, polygon: pendingPoints });
  }, [tool, pendingPoints, createZone]);

  const cancelPending = useCallback(() => {
    setPendingPoints([]);
    setMeasurePoints([]);
    setPendingMeasureDialog(null);
    setTool('select');
  }, []);

  // ── Measure handlers ──
  const onSaveMeasureLabel = useCallback((realDistance: number) => {
    if (!pendingMeasureDialog) return;
    const newMeasure: SavedMeasure = {
      id: `m-${Date.now()}`,
      a: pendingMeasureDialog.a,
      b: pendingMeasureDialog.b,
      realDistance,
    };
    setSavedMeasures([...savedMeasures, newMeasure]);
    setMeasurePoints([]);
    setPendingMeasureDialog(null);
    setTool('select');
    setSelectedMeasureId(newMeasure.id);
  }, [pendingMeasureDialog, savedMeasures]);

  const onCalibrateScale = useCallback((realDistance: number) => {
    if (!pendingMeasureDialog) return;
    const dx = pendingMeasureDialog.b.x - pendingMeasureDialog.a.x;
    const dy = pendingMeasureDialog.b.y - pendingMeasureDialog.a.y;
    const distPx = Math.hypot(dx, dy);
    const newScale = distPx / realDistance;
    updateDesign.mutate({ scalePxPerMeter: newScale });
    setMeasurePoints([]);
    setPendingMeasureDialog(null);
    setTool('select');
  }, [pendingMeasureDialog, updateDesign]);

  const cancelMeasure = useCallback(() => {
    setMeasurePoints([]);
    setPendingMeasureDialog(null);
    setTool('select');
  }, []);

  const clearAllMeasures = useCallback(() => {
    setSavedMeasures([]);
    setSelectedMeasureId(null);
  }, []);

  const removeMeasure = useCallback((id: string) => {
    setSavedMeasures((prev) => prev.filter((m) => m.id !== id));
    if (selectedMeasureId === id) setSelectedMeasureId(null);
  }, [selectedMeasureId]);

  // ✨ When measure endpoints move, RECALCULATE real distance from new pixel distance
  //    (uses scalePxPerMeter; preserves "anchor" behavior — what user set stays valid relative to new geometry)
  const updateMeasure = useCallback((id: string, updates: Partial<SavedMeasure>) => {
    setSavedMeasures((prev) => prev.map((m) => {
      if (m.id !== id) return m;
      const next = { ...m, ...updates };
      // Auto-recompute real distance when endpoints change
      if (updates.a || updates.b) {
        const scale = designQuery.data?.scalePxPerMeter ?? 67.2;
        const dx = next.b.x - next.a.x;
        const dy = next.b.y - next.a.y;
        const distPx = Math.hypot(dx, dy);
        next.realDistance = distPx / scale;
      }
      return next;
    }));
  }, [designQuery.data?.scalePxPerMeter]);

  // ── Arrow-key nudge for selected sensor or measure ──
  const nudgeSelected = useCallback((dx: number, dy: number) => {
    if (selectedMeasureId) {
      setSavedMeasures((prev) => prev.map((m) => {
        if (m.id !== selectedMeasureId) return m;
        return { ...m, a: { x: m.a.x + dx, y: m.a.y + dy }, b: { x: m.b.x + dx, y: m.b.y + dy } };
      }));
      return true;
    }
    if (selectedSensorId) {
      const sensor = designQuery.data?.sensors?.find((s) => s.id === selectedSensorId);
      if (!sensor) return false;
      const newX = sensor.x + dx;
      const newY = sensor.y + dy;
      updateSensorDebounced(selectedSensorId, { x: newX, y: newY }, 200);
      return true;
    }
    return false;
  }, [selectedMeasureId, selectedSensorId, designQuery.data, updateSensorDebounced]);

  const deleteSelected = useCallback(() => {
    if (selectedMeasureId) {
      removeMeasure(selectedMeasureId);
      return true;
    }
    if (selectedSensorId) {
      deleteSensor.mutate(selectedSensorId);
      return true;
    }
    return false;
  }, [selectedMeasureId, selectedSensorId, removeMeasure, deleteSensor]);

  // ── Derived ──
  const design = designQuery.data;
  const selectedSensor: SensorPlacement | undefined = design?.sensors?.find(s => s.id === selectedSensorId);
  const selectedZone: CoverageZone | undefined = design?.zones?.find(z => z.id === selectedZoneId);
  const selectedMeasure: SavedMeasure | undefined = savedMeasures.find((m) => m.id === selectedMeasureId);

  const sensorsByFunction = (design?.sensors ?? []).reduce<Record<string, SensorPlacement[]>>((acc, s) => {
    if (!acc[s.functionType]) acc[s.functionType] = [];
    acc[s.functionType].push(s);
    return acc;
  }, {});

  return {
    design,
    isLoading: designQuery.isLoading,
    error: designQuery.error,
    refetch: () => designQuery.refetch(),

    tool,
    setTool,
    pendingPoints,
    pendingSensorFunction,
    setPendingSensorFunction,

    measurePoints,
    savedMeasures,
    selectedMeasureId,
    setSelectedMeasureId,
    selectedMeasure,
    pendingMeasureDialog,
    onSaveMeasureLabel,
    onCalibrateScale,
    cancelMeasure,
    clearAllMeasures,
    removeMeasure,
    updateMeasure,
    deleteSelected,
    nudgeSelected,

    selectedSensorId,
    setSelectedSensorId,
    selectedZoneId,
    setSelectedZoneId,
    selectedSensor,
    selectedZone,

    coverageMode,
    setCoverageMode,
    sensorDisplay,
    setSensorDisplay,
    showOverlap,
    setShowOverlap,
    showUncovered,
    setShowUncovered,
    showLabels,
    setShowLabels,

    leftPanelOpen,
    setLeftPanelOpen,
    rightPanelOpen,
    setRightPanelOpen,

    sensorsByFunction,

    handleCanvasClick,
    finishPolygon,
    cancelPending,
    createSensor,
    updateSensor,
    updateSensorDebounced,
    updateSensorImmediate,
    deleteSensor,
    createZone,
    deleteZone,
    recalcDesign,
    updateDesign,
    uploadFloorPlan,
  };
}
