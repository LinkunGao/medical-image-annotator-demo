# Canvas Design Analysis

## Q: Is the current canvas design in `CommToolsData.ts` reasonable?

**A: Yes, it is a pragmatic Layered Canvas Rendering Architecture for a 2D medical annotator, but has clear limitations.**

### ✅ Pros
1. **Separation of Concerns**: 
   - **Base Layer (`displayCanvas`)**: Static medical image.
   - **Interaction Layer (`drawingCanvas`)**: Real-time strokes/events.
   - **Result Layers (`Layer 1-3` + `Master`)**: Segmentation results.
   - This prevents re-rendering the heavy medical image when just drawing a line.
   
2. **Performance**: 
   - 2D Canvas is fast enough for single-slice annotation.
   - Uses `emptyCanvas` as an off-screen buffer for efficient resizing/scaling.

3. **Simplicity**:
   - Pure Canvas 2D API, easy to maintain without WebGL complexity.

### ⚠️ Limitations
1. **Memory Usage**: Creates 8+ full-size canvases. High-res images or multiple viewports will consume significant RAM.
2. **Hardcoded Layers**: `layer1`, `layer2`, `layer3` are hardcoded properties. Adding more layers requires refactoring to an array-based approach.
3. **Synchronization**: Double-bookkeeping between `MaskVolume` (data) and `Canvas` (view). State must be carefully synced.
4. **Not 3D-Ready**: This stacking DOM approach doesn't scale well to 3D/MPR viewing compared to a single WebGL context.

### Conclusion
**Keep it for now** as it works for the current requirements. 
**Future Refactor**: Move to a single WebGL canvas or dynamic layer array if performance/layer count becomes an issue.


6. 还有一个UI 渲染问题， 当sphereTool画了sphere之后，通知right panel渲染sphere，这是正确的。但是我在退出sphereTool模式时，rightpanel应该要将sphere切换为之前的glb mask models啊。而且要隐藏sphere（tumour），当再次进入时又将他们的显示与隐藏再次切换
