# Audio

Empty on purpose.

All sound in Arena Rumble is synthesised at runtime by `src/audio/AudioManager.ts`
(crowd bed, countdown, weapon reports, hits, elimination, champion fanfare), so
the game ships with no audio files and no licensing question attached to them.

If you want real samples, drop them here and swap the bodies of the `play*`
methods in `AudioManager` to load and play buffers instead of oscillators. The
rest of the game only ever calls those methods, so nothing else has to change.
