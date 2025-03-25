Create an adaptive biomimicry particle system for a webpage that:

1. GOAL: Displays organic-looking particles that become more excited as they approach the bottom-right corner (near a cal.com button) and that respond to mouse movement, maintaining a buttery-smooth 50+ FPS on all devices.

2. PERFORMANCE OPTIMIZATION:
   - Implement intelligent particle count management (10-100 particles) based on device performance
   - Use weighted FPS averaging that prioritizes recent frames
   - Include stabilization periods after particle adjustments to prevent oscillation
   - Set wider buffer zones (45-60 FPS as "stable") to avoid frequent particle count changes
   - Implement graceful degradation for low-performance devices
   - Reduce resource usage when tab is not visible

3. VISUAL BIOMIMICRY:
   - Create organic movement with sine-wave motion patterns
   - Use flocking behavior that subtly directs particles toward the bottom-right
   - Include varied particle shapes with morphing animations
   - Implement smooth transitions for all property changes
   - Add subtle glow effects that intensify near the corner
   - Display fewer, higher-quality particles rather than many choppy ones

4. IMPLEMENTATION DETAILS:
   - Use requestAnimationFrame with performance throttling
   - Add smooth fade transitions for particle creation/removal
   - Avoid DOM thrashing by batching style updates
   - Throttle mouse interaction calculations
   - Use hardware-accelerated properties for animation
   - Ensure all visual elements have proper z-index management