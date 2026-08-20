import { asset } from '../core/paths';

export interface CharacterDefinition {
  id: string;
  name: string;
  model: string;
  /** Uniform scale so every character ends up roughly 1.8 m tall. */
  scale: number;
  /** Vertical offset applied after scaling, so the feet sit on y = 0. */
  yOffset: number;
  /**
   * Clip name remapping. GLBs exported from Mixamo often ship a single clip
   * with a machine generated name, so every logical state can point at it.
   */
  clips: Partial<Record<AnimationState, string[]>>;
  /** Team tint applied to a rim light shell around the model. */
  accent?: number;
}

export type AnimationState =
  | 'idle'
  | 'walk'
  | 'run'
  | 'jump'
  | 'fall'
  | 'attack'
  | 'death';

export const CHARACTERS: CharacterDefinition[] = [
  {
    id: 'tactical',
    name: 'Tactical',
    model: 'assets/characters/char_tactical.glb',
    scale: 1.0,
    yOffset: 0,
    clips: {
      // This model ships one Mixamo layer. Everything falls back to it and the
      // playback rate is adjusted per state (see CharacterLoader).
      idle: ['idle', 'Idle', 'Armature|Armature|mixamo.com|Layer0'],
      walk: ['walk', 'Walk', 'Armature|Armature|mixamo.com|Layer0'],
      run: ['run', 'Run', 'Armature|Armature|mixamo.com|Layer0'],
      jump: ['jump', 'Jump'],
      fall: ['fall', 'Fall'],
      attack: ['attack', 'Attack'],
      death: ['death', 'Death'],
    },
  },
];

export function characterById(id: string): CharacterDefinition | undefined {
  return CHARACTERS.find((c) => c.id === id);
}

export function characterUrl(c: CharacterDefinition): string {
  return asset(c.model);
}
