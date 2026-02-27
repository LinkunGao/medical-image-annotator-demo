# Overall Architecture Improvement Plan

## Executive Summary

This document outlines a **phased refactoring strategy** to improve the medical image annotator's architecture, addressing three critical areas: mask storage, tool extraction, and state management. Tasks are prioritized by **risk/benefit ratio** and **implementation dependencies**.

---

## 📊 Priority Overview

```
Priority 1 (Weeks 1-3)  → Mask Storage Migration
Priority 2 (Weeks 4-6)  → Tool Extraction Phase 1-2
Priority 3 (Weeks 7-8)  → Evaluation & Decision
Priority 4 (Deferred)   → State Management (lightweight improvements only)
```

---

## 🎯 Task Priority Matrix

| Task | Success Rate | Risk | Benefit | Duration | Priority | Status |
|------|--------------|------|---------|----------|----------|--------|
| **Mask Storage Migration** | 85-90% | 🟢 Low-Medium | 🟢 **High** | 2-3 weeks | ⭐⭐⭐⭐⭐ | ✅ Completed |
| **Tool Extraction - Phase 1** | 75-80% | 🟡 Medium | 🟢 Medium | 1 week | ⭐⭐⭐⭐ | ✅ Completed |
| **Tool Extraction - Phase 2** | 70-75% | 🟡 Medium | 🟡 Medium | 1-2 weeks | ⭐⭐⭐ | ✅ Completed |
| **Tool Extraction - Phase 3** | 65-70% | 🟡 Medium-High | 🟡 Medium | 2-3 weeks | ⭐⭐ | ✅ Completed |
| **State Management Refactor (Phased)** | 80-85% | 🟡 Low→Medium | 🟢 **High** | 3-4 weeks | ⭐⭐⭐⭐ | **Planned** |

---

## 📋 Detailed Task Breakdown

### Priority 1: Mask Storage Migration (Weeks 1-3)

**Current Problem:**
```typescript
// ❌ Current: Each slice as separate ImageData object
interface IPaintImage {
  index: number;
  image: ImageData;  // 512x512x4 bytes = ~1MB per slice
}
interface IPaintImages {
  x: Array<IPaintImage>;  // Fragmented memory
  y: Array<IPaintImage>;
  z: Array<IPaintImage>;
}
// Memory: ~100 slices × 3 layers × 1MB = 300MB + object overhead
```

**Solution:**
```typescript
// ✅ New: True 3D volume with Uint8Array
class MaskVolume {
  private data: Uint8Array;  // Single contiguous memory block
  private dimensions: { width: number; height: number; depth: number };
  private channels: number;  // Multi-channel support

  // Memory: 512×512×100×1 byte = 25MB per layer
  // Savings: 300MB → 75MB (75% reduction)
}
```

**Benefits:**
- 🟢 **Memory**: 75% reduction (300MB → 75MB)
- 🟢 **Performance**: Contiguous memory = better cache locality
- 🟢 **3D Operations**: True volumetric data structure
- 🟢 **Multi-channel**: Support confidence, labels, annotations
- 🟢 **AI Integration**: Direct transfer to backend models

**Risk Mitigation:**
- Provide `ImageData` compatibility layer for gradual migration
- Implement comprehensive unit tests before integration
- Maintain dual-track support during transition period
- Performance benchmarking at each milestone

**Detailed Plan:** See [mask_storage_migration_plan.md](mask_storage_migration_plan.md)

**Task List:** See [mask_storage_migration_task.md](mask_storage_migration_task.md)

---

### Priority 2: Tool Extraction - Phase 1 (Week 4)

**Objective:** Convert closure variables to class properties (prerequisite for tool extraction)

**Current Blocker:**
```typescript
// DrawToolCore.ts:340 - paintOnCanvas() closure
private paintOnCanvas() {
  // ❌ Closure variables block tool extraction
  let leftclicked = false;          // Pan state
  let rightclicked = false;         // Pan state
  let panelMoveInnerX = 0;          // Pan position
  let panelMoveInnerY = 0;          // Pan position
  let currentSliceIndex = 0;        // Slice tracking
  let Is_Painting = false;          // Drawing state
  let lines: Array<ICommXY> = [];   // Pencil/Brush path

  // Event handlers share these variables via closure
  this.drawingPrameters.handleOnDrawingMouseDown = (e) => {
    if (leftclicked) { /* uses closure variable */ }
  };
}
```

**Solution:**
```typescript
// ✅ Lift to class properties
export class DrawToolCore extends CommToolsData {
  // Drawing tool state
  private leftClicked = false;
  private rightClicked = false;
  private panelMoveInnerX = 0;
  private panelMoveInnerY = 0;
  private currentSliceIndex = 0;
  private isPainting = false;
  private drawingLines: Array<ICommXY> = [];

  private paintOnCanvas() {
    // Event handlers now use class properties
    this.drawingPrameters.handleOnDrawingMouseDown = (e) => {
      if (this.leftClicked) { /* uses class property */ }
    };
  }
}
```

**Benefits:**
- ✅ Enables tool extraction in subsequent phases
- ✅ Improves testability (can inspect state)
- ✅ Better debugging (can access state in DevTools)

**Success Criteria:**
- All 7 closure variables converted to class properties
- No behavior changes (pixel-perfect output)
- All existing tests pass
- Build with zero new errors

**Detailed Plan:** Will be generated after mask storage migration

---

### Priority 3: Tool Extraction - Phase 2 (Weeks 5-6)

**Objective:** Extract PanTool from paintOnCanvas()

**Why PanTool First:**
- 🟢 Relatively isolated (right-click only)
- 🟢 Minimal coupling with drawing logic
- 🟢 Good candidate to validate extraction pattern

**Implementation:**
```typescript
// tools/PanTool.ts
export class PanTool extends BaseTool {
  private panStartX = 0;
  private panStartY = 0;
  private isDragging = false;

  onPointerDown(e: PointerEvent): void {
    if (e.button !== 2) return;  // Right-click only
    this.isDragging = true;
    this.panStartX = e.clientX - this.ctx.nrrd_states.previousPanelL;
    this.panStartY = e.clientY - this.ctx.nrrd_states.previousPanelT;
  }

  onPointerMove(e: PointerEvent): void {
    if (!this.isDragging) return;
    this.updatePanelPosition(e.clientX, e.clientY);
  }

  onPointerUp(e: PointerEvent): void {
    this.isDragging = false;
  }
}
```

**Integration with DrawToolCore:**
```typescript
export class DrawToolCore extends CommToolsData {
  protected panTool!: PanTool;

  private initTools() {
    this.panTool = new PanTool(toolCtx);
  }

  private paintOnCanvas() {
    // Route right-click events to PanTool
    this.drawingPrameters.handleOnPanMouseMove = (e) => {
      this.panTool.onPointerMove(e as PointerEvent);
    };
  }
}
```

**Success Criteria:**
- PanTool handles all right-click panning
- No regression in pan behavior
- Unit tests for PanTool
- Integration tests pass

**Detailed Plan:** [tool_extraction_phase123_plan.md](completed/tool_extraction_phase123_plan.md) ✅

---

### Priority 4: Tool Extraction - Phase 3 (Completed 2026-02-27) ✅

**Objective:** Extract DrawingTool (pencil + brush + eraser drawing logic) from DrawToolCore

**Outcome:** Decision was "proceed" — DrawingTool extracted successfully.

**Result:**
- `DrawingTool` class (284 lines) extracted from DrawToolCore
- `DrawingCallbacks` interface (7 callbacks) for inversion of control
- DrawToolCore reduced by −249 total lines (vs original 1319)
- `paintOnCanvas()` reduced by −224 lines (vs original ~580)
- Zero new TypeScript errors; all manual tests passed

**Detailed Plan:** [tool_extraction_phase123_plan.md](completed/tool_extraction_phase123_plan.md) ✅
**Task List:** [tool_extraction_phase123_task.md](completed/tool_extraction_phase123_task.md) ✅

---

### Priority 5: State Management Refactor (Planned)

**Objective:** Full state reorganization — encapsulate Vue access, extract misplaced callbacks/methods, enforce visibility, split flat state objects into semantic groups.

**Audit Results (2026-02-27):**
- `nrrd_states`: 44 properties, ~500+ internal refs — mixes image metadata, mouse tracking, sphere tool state, 5 callbacks
- `gui_states`: 30+ properties, ~136 internal refs — mixes tool config, 6 methods(!), internal render flags
- `protectedData`: 20+ properties, ~398 internal refs — relatively well-structured (canvas/ctx/mask)
- External violations: only 4 read-only + ~39 via `guiSettings` pattern
- Total: ~1077 references across ~13 files

**5-Phase Approach (each independently deployable):**

| Phase | Scope | Risk | Duration |
|-------|-------|------|----------|
| 1: GUI API Encapsulation | Vue `guiSettings` → typed NrrdTools methods | 🟢 Low | 2-3 days |
| 2: Callbacks & Methods Extraction | 5 callbacks out of nrrd_states, 6 methods out of gui_states | 🟢 Low | 1-2 days |
| 3: Visibility Enforcement | state objects → `protected`, fix 4 external violations | 🟢 Low | 1 day |
| 4: nrrd_states Semantic Split | 44 props → IImageMetadata, IViewState, IInteractionState, ISphereState, IInternalFlags | 🟡 Medium | 1-2 weeks |
| 5: gui_states Cleanup | 24 props → IToolModeState, IDrawingConfig, IViewConfig, ILayerChannelState | 🟡 Medium | 3-5 days |

**vs Previous "Not Recommended" Assessment:**

| | Previous (big-bang) | New (phased) |
|---|---|---|
| **Risk** | 🔴 High — all or nothing | 🟡 Low→Medium — each phase independent |
| **Duration** | 6-8 weeks | 3-4 weeks |
| **Reversibility** | Low | High — each phase independently reversible |
| **Migration** | Change all 738 refs at once | Tool-by-tool, file-by-file |
| **Ship cadence** | Only after everything done | After each phase |

**Detailed Plan:** [gui_state_api_refactor_plan.md](gui_state_api_refactor_plan.md)
**Task List:** [gui_state_api_refactor_task.md](gui_state_api_refactor_task.md)

---

## 📅 Implementation Timeline

### Phase 1: Mask Storage Migration (Weeks 1-3)

**Week 1: Foundation**
- [ ] Day 1-2: MaskVolume class implementation
- [ ] Day 3: Unit tests (getVoxel, setVoxel, slicing)
- [ ] Day 4: ImageData compatibility layer
- [ ] Day 5: Performance benchmarks

**Week 2: Integration**
- [ ] Day 1-2: Migrate ImageStoreHelper internals
- [ ] Day 3: Update DrawToolCore storage calls
- [ ] Day 4: Update NrrdTools sync methods
- [ ] Day 5: Integration tests

**Week 3: Validation**
- [ ] Day 1-2: Comprehensive regression testing
- [ ] Day 3: Performance comparison (memory/speed)
- [ ] Day 4: Bug fixes
- [ ] Day 5: Documentation & code review

**Exit Criteria:**
- ✅ All tests pass
- ✅ Memory usage reduced by >50%
- ✅ No visual differences in rendered masks
- ✅ Performance maintained or improved

---

### Phase 2: Tool Extraction - Closure Variables (Week 4)

**Week 4: Refactoring**
- [ ] Day 1: Lift 7 closure variables to class properties
- [ ] Day 2: Update event handlers to use class properties
- [ ] Day 3: Refactor naming (leftclicked → leftClicked)
- [ ] Day 4: Testing (drawing, pan, sphere)
- [ ] Day 5: Code review & documentation

**Exit Criteria:**
- ✅ Zero behavior changes
- ✅ All tests pass
- ✅ Build with zero new errors
- ✅ State accessible for debugging

---

### Phase 3: Tool Extraction - PanTool (Weeks 5-6)

**Week 5: Implementation**
- [ ] Day 1: Create PanTool class
- [ ] Day 2: Implement pointer events (down/move/up)
- [ ] Day 3: Integrate with DrawToolCore
- [ ] Day 4: Unit tests for PanTool
- [ ] Day 5: Integration tests

**Week 6: Validation**
- [ ] Day 1-2: Regression testing
- [ ] Day 3: Edge case testing
- [ ] Day 4: Bug fixes
- [ ] Day 5: Documentation

**Exit Criteria:**
- ✅ Pan behavior identical to before
- ✅ PanTool unit tests pass
- ✅ Integration tests pass
- ✅ Code review approved

---

### Phase 4: Evaluation (Weeks 7-8)

**Week 7: Review & Decision**
- [ ] Review code quality improvements
- [ ] Assess development velocity impact
- [ ] Evaluate bug reduction
- [ ] Team retrospective
- [ ] **Decision**: Continue to Pencil/Brush extraction or pivot to new features

**Week 8: Planning**
- If continue: Detailed plan for Pencil/Brush extraction
- If pivot: New feature development roadmap

---

## 🎯 Success Metrics

### Quantitative Metrics

| Metric | Baseline | Target | Measurement |
|--------|----------|--------|-------------|
| **Memory Usage** | 300MB (3 layers) | <120MB | DevTools Memory Profiler |
| **Mask Load Time** | TBD | -30% | Performance.now() benchmarks |
| **DrawToolCore Lines** | 1319 | <1000 | Line count |
| **Code Duplication** | TBD | -20% | SonarQube/jscpd |
| **Test Coverage** | TBD | >70% | Vitest coverage |

### Qualitative Metrics

- ✅ Easier to add new drawing tools
- ✅ Reduced onboarding time for new developers
- ✅ Clearer separation of concerns
- ✅ Improved debugging experience

---

## 🚨 Risk Management

### Risk: Mask Storage Migration Breaks Rendering

**Probability:** Low
**Impact:** High

**Mitigation:**
- Comprehensive visual regression tests
- Pixel-by-pixel comparison of before/after
- Dual-track support (keep ImageData temporarily)
- Feature flag for gradual rollout

**Rollback Plan:**
- Revert MaskVolume integration
- Restore ImageData-based storage
- Document lessons learned

---

### Risk: Tool Extraction Introduces Bugs

**Probability:** Medium
**Impact:** Medium

**Mitigation:**
- Extensive unit tests for each tool
- Integration tests for tool interactions
- Manual testing of all drawing scenarios
- Code review before each phase

**Rollback Plan:**
- Keep git tags at each phase
- Revert to previous phase if bugs > 3 critical
- Document issues for future attempts

---

### Risk: Timeline Overruns

**Probability:** Medium
**Impact:** Low

**Mitigation:**
- Conservative time estimates (buffer)
- Daily progress tracking
- Weekly milestone reviews
- Flexible scope (phases are optional)

**Response:**
- Pause and reassess after each phase
- Extend timeline if needed
- Reduce scope (skip optional phases)

---

## 📚 Documentation Requirements

### Per Phase Documentation

1. **Technical Design Doc**
   - Architecture diagrams
   - API changes
   - Migration guide

2. **Testing Report**
   - Test coverage metrics
   - Performance benchmarks
   - Known issues

3. **Developer Guide**
   - How to use new APIs
   - Code examples
   - Migration path for existing code

4. **Changelog**
   - Breaking changes
   - Deprecations
   - New features

---

## 🔄 Review & Approval Process

### Phase Completion Checklist

- [ ] All tasks completed
- [ ] Exit criteria met
- [ ] Tests passing
- [ ] Documentation updated
- [ ] Code review approved
- [ ] Performance benchmarks acceptable
- [ ] Team demo completed
- [ ] Go/No-Go decision for next phase

### Decision Gates

**After Mask Storage Migration (Week 3):**
- Continue to Tool Extraction Phase 1?
- Adjust timeline?
- Change scope?

**After Tool Extraction Phase 1 (Week 4):**
- Continue to PanTool extraction?
- Lessons learned?

**After Tool Extraction Phase 2 (Week 6):**
- Continue to Pencil/Brush extraction?
- Or pivot to new features?

---

## 🎓 Lessons Learned (To Be Updated)

### What Worked Well
- TBD after each phase

### What Didn't Work
- TBD after each phase

### What to Do Differently
- TBD after each phase

---

## 📖 References

- [Mask Storage Migration Plan](mask_storage_migration_plan.md)
- [Mask Storage Migration Tasks](mask_storage_migration_task.md)
- [Tool Extraction Plan](tool_extraction_plan.md) (existing)
- [Tool Extraction Tasks](tool_extraction_task.md) (existing)

---

## Appendix: Trade-off Analysis

### Why Not State Management First?

| Criterion | Mask Storage | Tool Extraction | State Management |
|-----------|--------------|-----------------|------------------|
| **Impact Scope** | Internal only | 2 files | **4 files, 738 refs** |
| **Reversibility** | High (encapsulated) | Medium | **Low (widespread)** |
| **User Benefit** | Performance | Maintainability | **None** |
| **Test Burden** | Low (unit testable) | Medium | **High (E2E needed)** |
| **Time to Value** | 3 weeks | 6 weeks | **8+ weeks** |

### Why Mask Storage First?

1. **Foundation for AI Features**: Multi-channel support enables confidence maps, probability distributions
2. **Performance Impact**: Memory reduction directly improves UX on large datasets
3. **Low Risk**: Internal implementation detail, doesn't change APIs
4. **Quick Wins**: Visible improvements in 3 weeks
5. **Enables Tool Work**: Simpler data structure makes tool extraction easier

### Why Phase Tool Extraction?

1. **Incremental Validation**: Each phase validates the approach
2. **Manageable Scope**: 1-2 week chunks vs 5-week monolith
3. **Flexibility**: Can stop after Phase 1 or 2 if not valuable
4. **Risk Reduction**: Smaller changes = easier rollback

---

**Last Updated:** 2026-02-27
**Next Review:** N/A — All planned phases complete
**Owner:** Development Team
**Status:** ✅ Mask Storage Migration + Tool Extraction Phase 1-2-3 complete. State Management Refactor (5-phase) planned.
