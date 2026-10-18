/**
 * Muscle shapes for the anatomy map, keyed by muscle_ref.name. Each figure is
 * 100 × 205 units. Shapes are drawn for the figure's left half (x < 50) and
 * mirrored; `center` shapes sit on the midline and are drawn once. `fibers` are
 * thin lines drawn over the muscles for texture only.
 */
export interface Figure {
  /** Body outline for the left half, mirrored for the right. */
  silhouette: string
  head: { cx: number; cy: number; r: number }
  /** A smiley on the head marks the front view. */
  face?: boolean
  muscles: Record<string, string>
  center?: Record<string, string>
  fibers: string
}

const SILHOUETTE =
  'M50 23 L44 23 Q36 27 29 29 Q18 30 16 43 Q15 56 17 66 Q15 77 16 88 L15 96 Q17 101 22 100 Q27 96 26 88 ' +
  'Q28 77 27 67 L29 58 Q31 67 33 75 Q35 83 35 90 Q29 101 29 118 Q30 132 34 141 Q31 160 33 179 L33 186 ' +
  'Q31 195 35 198 L45 198 Q46 191 43 185 Q42 170 42 151 Q43 142 45 140 Q48 121 49 99 L50 97 Z'

export const FRONT: Figure = {
  silhouette: SILHOUETTE,
  head: { cx: 50, cy: 12, r: 10 },
  face: true,
  muscles: {
    'upper traps': 'M44.5 23.5 Q40 27.5 30 29.8 Q36 31.6 41 31.6 Z',
    'neck flexors': 'M46.5 20.5 Q44 26 41 31.6 L44.5 32 Q46.5 26 48.6 22 Z',
    'side delts': 'M29 29.5 Q19.5 30.5 16.5 41 Q16 45.5 18.5 48 Q20 40 25 34 Q27 31.5 29 29.5 Z',
    'front delts': 'M29 29.5 Q25 32 21.5 38 Q19.5 43 18.5 48 Q22 49 24.5 47 Q27 40 33.5 34.5 Q31 32 29 29.5 Z',
    'upper chest': 'M49.6 33 Q42 31.8 35 33.6 L33.5 34.5 Q29.5 37 28.5 40 Q38 38.5 49.6 39.5 Z',
    'mid chest': 'M49.6 39.5 Q38 38.5 28.5 40 Q27.5 44 30 47.5 Q40 49.5 49.6 47 Z',
    'lower chest': 'M49.6 47 Q40 49.5 30 47.5 Q33 52 40 53 Q46 53.5 49.6 51.5 Z',
    obliques: 'M43.5 54 Q37 53.5 32.5 55 Q29.5 58 30 63 Q31.5 70 33 76 Q35 84 39 86 L43.5 87 Z',
    'serratus anterior':
      'M30 48.5 L27.8 49.8 L28.6 53.2 L32 52.6 Z M28.8 54.2 L29.2 58 L33 57.6 L32.2 54 Z M29.6 59.4 L30.6 62.6 L33.6 62.2 L33 59 Z',
    'rectus abdominis':
      'M49.6 53.5 L43.5 53.5 Q42.6 56.5 43.5 60 L49.6 60 Z M49.6 61 L43.5 61 L43.5 68 L49.6 68 Z ' +
      'M49.6 69 L43.5 69 L43.5 76.5 L49.6 76.5 Z M49.6 77.5 L43.5 77.5 Q44 84 49.6 89 Z',
    biceps: 'M23.5 47.5 Q19.5 53 20 61 Q21.5 66 24.5 66 Q28.5 58 28 50 Q26 47 23.5 47.5 Z',
    'triceps lateral and medial heads': 'M18.5 48 Q15.8 55 17 64 L20 61 Q19.5 53 21.5 47.8 Z',
    brachialis: 'M17 64 Q17.5 67 20 68.5 L24.5 66 Q21.5 66 20 61 Z',
    brachioradialis: 'M20 68.5 Q16 73 16.5 82 Q17 86 18.5 88 L21 88 Q19.5 78 23 69 Z',
    'forearm flexors': 'M23 69 Q19.5 78 21 88 L26 88 Q27.5 77 26.5 68 Q25.5 66.5 24.5 66 Z',
    wrists: 'M18.2 88.3 L26 88.3 L25.4 91.8 L18.4 91.4 Z',
    'glute med': 'M35.5 88.5 Q31.5 93 30.5 99 L35 100 L41 98.5 Z',
    'hip flexors': 'M35.5 88.5 Q38 86.3 41.5 86 Q44.5 89 46.5 95 L43.5 99.5 L41 98.5 Z',
    'vastus lateralis': 'M30.5 99 Q28.8 110 29.5 120 Q30.5 131 35 138.5 L39 135.5 Q36 116 41 98.5 L35 100 Z',
    'rectus femoris': 'M41 98.5 Q36 116 39 135.5 L42 135 Q45.5 116 43.5 99.5 Z',
    adductors: 'M43.5 99.5 Q45.5 116 44.5 124 L48.8 122 Q49.6 108 49.6 97.5 Q46.5 95.5 43.5 99.5 Z',
    'vastus medialis': 'M44.5 124 Q42 130 42 135 L42.5 137.5 Q46 140.5 48.4 137 Q49 129 48.8 122 Z',
    peroneals: 'M34 143 Q31 160 33 178 L36 178 Q35 160 37 144 Z',
    'tibialis anterior': 'M37 144 Q35 160 36 178 L39.5 178 Q40 160 40.5 143 Z',
    gastrocnemius: 'M40.5 143 Q40 160 39.5 170 Q42.5 162 43 150 Q43.5 144 44.5 141 Z',
    soleus: 'M39.5 170 Q42 165 43 156 Q43.5 168 42.5 178 L39.5 178 Z',
    'foot intrinsics': 'M35.5 186 Q32.5 192 35.5 196.5 L44.5 196.5 Q44.5 190 42.5 186 Z',
  },
  fibers:
    'M33 35.5 L46 36.5 M31 38.6 L47 40.5 M30 42.5 L47 44.5 M31 46 L46 49.5 ' +
    'M22.5 37 L25.5 44 M20.5 40 L22 46.5 M26 33.5 L28.5 37 ' +
    'M24.5 50.5 Q23.5 57 24.5 63 M18.5 51 L18 60 ' +
    'M19 72 Q18.4 79 19.4 85 M24.6 71.5 Q23.6 79 24.2 86 ' +
    'M35 60 L41 66 M34.4 66.5 L41.5 73 M35.6 73.5 L42 79.5 ' +
    'M33 106 Q32.4 120 35.4 132 M39.4 104 Q38.4 118 40.4 131 M46.4 103 Q46.4 113 46 120 ' +
    'M38.4 150 L38 172 M35 152 L34.6 170 M44.5 26 L42.5 30',
}

export const BACK: Figure = {
  silhouette: SILHOUETTE,
  head: { cx: 50, cy: 12, r: 10 },
  muscles: {
    'neck extensors': 'M47.5 21 L43.5 21 L44 29 L48 30 Z',
    'upper traps': 'M48 24 Q41 27 30 30.5 L36.5 34 Q44 32 49.6 35.5 L49.6 24 Z',
    supraspinatus: 'M37.5 33.5 Q33 33 30.5 35 L37 36 Z',
    'side delts': 'M29 29.5 Q19.5 30.5 16.5 41 Q16 45.5 18.5 48 Q20 40 25 34 Q27 31.5 29 29.5 Z',
    'rear delts': 'M30 30.5 Q24.5 33 21 39.5 Q19.2 44 18.8 48 Q23 48.5 26.8 44.5 Q28.5 37.5 35 34 Z',
    'mid traps': 'M49.6 35.5 Q43 33.5 37.5 35 Q38 39 40 41.5 L49.6 42 Z',
    infraspinatus: 'M37 36 Q31.5 39 32 46 Q36 48.5 40 47.5 Q41 44 40 41.5 Q38 39 37 36 Z',
    rhomboids: 'M47.5 42 L40.5 41.8 Q40.5 46 42 50 L47.5 50 Z',
    'lower traps': 'M49.6 42 L47.5 42 L47.5 50 L42 50 Q45 58 49.6 64 Z',
    'teres minor': 'M31.5 45.5 Q29.5 48 30 50 L35 49.5 Q33 47.5 31.5 45.5 Z',
    'teres major': 'M30 50.5 Q29 53 31 55.5 L38.5 52.5 L35.5 49.8 Z',
    lats: 'M31 55.5 Q29.5 64 33 73 Q36.5 80 44.5 83 L45.3 70 Q43 58 42 51 L38.5 52.5 Z',
    'erector spinae': 'M49.2 64 Q46 62.5 45.3 66 Q44.5 78 45.3 86.5 L49.2 88.5 Z',
    'quadratus lumborum': 'M45.3 70 L44.5 83 Q44.6 86 45.3 86.5 Z',
    'triceps long head': 'M26.5 46.5 Q28.5 54 27.5 64 L24.5 65 Q23.5 55 24.5 47 Z',
    'triceps lateral and medial heads': 'M24.5 47 Q17.5 52 18 62 L22 65.5 L24.5 65 Q23.5 55 24.5 47 Z',
    'forearm extensors': 'M18 62 Q15.2 72 16.3 84 L18 88 L25.8 88 Q27.6 76 27 66 L24.5 65 L22 65.5 Z',
    wrists: 'M18.2 88.3 L26 88.3 L25.4 91.8 L18.4 91.4 Z',
    'glute med': 'M34.5 83 Q31 88 30.5 94.5 Q35 94.5 40 92.5 Q42.5 88.5 45.3 86.5 L44.5 83 Q39 82 34.5 83 Z',
    'glute max': 'M45.3 88.5 Q38 90.5 33 96.5 Q32 106 36 110.5 Q43 112.5 49.6 108.5 L49.6 90.5 Z',
    'vastus lateralis': 'M33 96.5 Q29.5 104 29.4 116 Q30 128 32 138 L34.5 111 Q32.4 106 33 96.5 Z',
    adductors: 'M47.5 109.5 Q45 113 46.5 121 L49.6 119 L49.6 109.5 Z',
    'biceps femoris': 'M34.5 111 Q30.5 124 32 138 L38.5 140 Q39.5 126 41 113 Z',
    'inner hamstrings': 'M41 113 Q39.5 126 38.5 140 L45 140 Q47.5 126 46.5 121 L45.3 112.5 Z',
    gastrocnemius: 'M35.5 144 Q31.5 152 34.5 162 L40.5 164 L40.5 145 Z M41.5 145 L41.5 164 L46 162 Q48 152 45 144 Z',
    soleus: 'M34.5 162.5 Q33.5 172 36.5 179 L44.5 179 Q46.2 170 46 162.5 L41 164.8 Z',
    'foot intrinsics': 'M35.5 186 Q32.5 192 35.5 196.5 L44.5 196.5 Q44.5 190 42.5 186 Z',
  },
  center: {
    'thoracic spine': 'M49.2 36 L50.8 36 L50.8 64 L49.2 64 Z',
  },
  fibers:
    'M45 27 L37 31.5 M48 38 L41 38.5 M48 46 L44 51 ' +
    'M36 59 Q39 68 43.5 78 M33 63 Q36 71 40.5 79 M40 55 Q42 63 44.5 72 ' +
    'M37 95 Q42 98 48 97.5 M35 101.5 Q41 104.5 48 103.5 ' +
    'M35.5 118 L35 134 M43 118 L42.4 135 ' +
    'M37.5 149 L38 160 M44 149 L43.5 160 ' +
    'M25.8 50 Q26.3 57 25.8 62 M21 52 Q20 57 20.5 61 ' +
    'M47.3 67 L47.3 85 M21 69 Q19.5 77 20 85 M24.5 69 Q23.6 77 24 86 ' +
    'M33 38 L38.5 44 M24 36 L23 44',
}

/** Deep muscles with no surface shape; listed beside the map instead. */
export const NOT_DRAWN = ['subscapularis', 'transverse abdominis', 'glute min', 'deep hip rotators', 'toe flexors', 'heart and lungs']
