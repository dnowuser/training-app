/**
 * Muscle shapes for the anatomy map, keyed by muscle_ref.name. Each figure is
 * 100 × 205 units. Shapes are drawn for the figure's left half (x < 50) and
 * mirrored; `center` shapes sit on the midline and are drawn once.
 */
export interface Figure {
  /** Body outline for the left half, mirrored for the right. */
  silhouette: string
  head: { cx: number; cy: number; r: number }
  muscles: Record<string, string>
  center?: Record<string, string>
}

const SILHOUETTE =
  'M50 23 L44 23 Q36 27 29 29 Q18 30 16 43 Q15 56 18 66 Q15 77 16 88 L15 96 Q17 101 22 100 Q27 96 26 88 ' +
  'Q28 77 27 67 L29 58 Q31 67 33 75 Q35 83 35 90 Q29 101 29 118 Q30 132 34 141 Q31 160 33 179 L33 186 ' +
  'Q31 195 35 198 L45 198 Q46 191 43 185 Q42 170 42 151 Q43 142 45 140 Q48 121 49 99 L50 97 Z'

export const FRONT: Figure = {
  silhouette: SILHOUETTE,
  head: { cx: 50, cy: 12, r: 10 },
  muscles: {
    'triceps lateral and medial heads': 'M20.5 46 Q16.5 54 18 63.5 L20.5 57.5 Q20 51 21 46.5 Z',
    soleus: 'M39.5 170 Q42 165 43 156 Q43.5 168 42.5 178 L39.5 178 Z',
    gastrocnemius: 'M40.5 143 Q40 160 39.5 170 Q42.5 162 43 150 Q43.5 144 44.5 141 Z',
    'neck flexors': 'M46 21 L41 31 L44 32 L48.5 23 Z',
    'upper traps': 'M44 24 Q37 28 30 30 L40 31.5 Z',
    'side delts': 'M29 29.5 Q19 31 17 43 Q18 47 20.5 46 Q21 36 29 29.5 Z',
    'front delts': 'M30 31 Q23 34 21 46 Q25 47 28 44 Q30 37 35 34 Z',
    'upper chest': 'M49.5 33 Q41 32 35 34 Q31 36 30 39 Q40 38 49.5 39 Z',
    'mid chest': 'M49.5 39 Q40 38 30 39 Q29 44 32 47 Q40 48.5 49.5 46.5 Z',
    'lower chest': 'M49.5 46.5 Q40 48.5 32 47 Q34 51 40 52.5 Q46 52.5 49.5 50.5 Z',
    'serratus anterior': 'M31.5 50 L28.5 49.5 L29 53.5 L32.5 54 Z M31 55.5 L28.5 55 L29 59 L32.5 59 Z',
    biceps: 'M24.5 47 Q20.5 52 21 61 Q22.5 65 25 64.5 Q28 57 28 49 Z',
    brachialis: 'M20.5 57 Q18 62 19 66.5 L22 67 Q21 62 21 58 Z',
    brachioradialis: 'M21.5 67 Q17 74 18 84 L21 87.5 Q20 77 23 68 Z',
    'forearm flexors': 'M23 68 Q20 77 21 87.5 L25.5 87.5 Q27 76 26 67.5 Z',
    wrists: 'M18 88 L26 88 L25.5 92 L18.5 92 Z',
    'rectus abdominis':
      'M49.5 53 L43.5 53 Q42.5 56 43.5 59.5 L49.5 59.5 Z M49.5 60.5 L43.5 60.5 L43.5 67.5 L49.5 67.5 Z ' +
      'M49.5 68.5 L43.5 68.5 L43.5 75.5 L49.5 75.5 Z M49.5 76.5 L43.5 76.5 Q44 83 49.5 88 Z',
    obliques: 'M43.5 54 Q35 54.5 32.5 59 Q32.5 71 36 80 Q39 84.5 43.5 85 Z',
    'hip flexors': 'M35.5 91 Q37 87 41.5 85 Q44.5 88 46.5 94 L43.5 99 L41 98 Z',
    'vastus lateralis': 'M35.5 91 Q29 102 29.5 118 Q30.5 131 35 138.5 L39 135.5 Q36 116 41 98 Z',
    'rectus femoris': 'M41 98 Q36 116 39 135.5 L42 135 Q45.5 116 43.5 99 Z',
    adductors: 'M43.5 99 Q45.5 116 44.5 124 L48.8 122 Q49.6 108 49.5 97.5 Q46.5 96 43.5 99 Z',
    'vastus medialis': 'M44.5 124 Q42 130 42 135 L42.5 137.5 Q46 140.5 48.4 137 Q49 129 48.8 122 Z',
    peroneals: 'M34 143 Q31 160 33 178 L36 178 Q35 160 37 144 Z',
    'tibialis anterior': 'M37 144 Q35 160 36 178 L39.5 178 Q40 160 40.5 143 Z',
    'foot intrinsics': 'M35.5 186 Q32.5 192 35.5 196.5 L44.5 196.5 Q44.5 190 42.5 186 Z',
  },
}

export const BACK: Figure = {
  silhouette: SILHOUETTE,
  head: { cx: 50, cy: 12, r: 10 },
  muscles: {
    'neck extensors': 'M47.5 21 L43.5 21 L44 29 L48 30 Z',
    'upper traps': 'M48 24 Q41 27 30 30.5 L36.5 34 Q44 32 49.5 35.5 L49.5 24 Z',
    supraspinatus: 'M37.5 33.5 Q33 33 30.5 35 L37 36 Z',
    'side delts': 'M29 29.5 Q19 31 17 43 Q18 47 20 46 Q21 36 29 29.5 Z',
    'rear delts': 'M30 30.5 Q22 33 20.5 45.5 Q24.5 46.5 27 44 Q28.5 37 35 34 Z',
    'mid traps': 'M49.5 35.5 Q43 33.5 37.5 35 Q38 39 40 41.5 L49.5 42 Z',
    infraspinatus: 'M37 36 Q31.5 39 32 46 Q36 48.5 40 47.5 Q41 44 40 41.5 Q38 39 37 36 Z',
    rhomboids: 'M47.5 42 L40.5 41.8 Q40.5 46 42 50 L47.5 50 Z',
    'lower traps': 'M49.5 42 L47.5 42 L47.5 50 L42 50 Q45 58 49.5 64 Z',
    'teres minor': 'M31.5 45.5 Q29.5 48 30 50 L35 49.5 Q33 47.5 31.5 45.5 Z',
    'teres major': 'M30 50.5 Q29 53 31 55.5 L38.5 52.5 L35.5 49.8 Z',
    lats: 'M31 56 Q30 63 34 72 Q38 78 43 80 L45 68 Q43 58 42 51 L38.5 53 Z',
    'erector spinae': 'M49 64 Q46 62.5 45.3 66 Q44.5 78 45.3 86.5 L49 88.5 Z',
    'quadratus lumborum': 'M45 71 L43 80 Q43 85 45 87 Z',
    'triceps long head': 'M26.5 46.5 Q28.5 54 27.5 64 L24.5 65 Q23.5 55 24.5 47 Z',
    'triceps lateral and medial heads': 'M24.5 47 Q17.5 52 18 62 L22 65.5 L24.5 65 Q23.5 55 24.5 47 Z',
    'forearm extensors': 'M19.5 67.5 Q16 76 18 86 L25.5 88 Q27 76 25.5 67 Z',
    wrists: 'M18 88 L26 88 L25.5 92 L18.5 92 Z',
    'glute med': 'M35.5 86.5 Q31.5 88.5 31 94.5 Q35 94.5 40 92.5 Q42.5 88.5 45 86.5 Z',
    'glute max': 'M45.5 88.5 Q38 90.5 33 96.5 Q32 106 36 110.5 Q43 112.5 49.5 108.5 L49.5 90.5 Z',
    adductors: 'M47.5 109.5 Q45 113 46.5 121 L49.5 119 L49.5 109.5 Z',
    'biceps femoris': 'M34.5 111 Q29.5 124 32 138 L38.5 140 Q39.5 126 41 113 Z',
    'inner hamstrings': 'M41 113 Q39.5 126 39 140 L45 140 Q47 126 46.5 121.5 L45 112.5 Z',
    gastrocnemius: 'M35.5 144 Q31.5 152 34.5 162 L40.5 164 L40.5 145 Z M41.5 145 L41.5 164 L46 162 Q48 152 45 144 Z',
    soleus: 'M34.5 163 Q34 172 37 178.5 L44.5 178.5 Q46 170 46 163 L41 165 Z',
    'foot intrinsics': 'M35.5 186 Q32.5 192 35.5 196.5 L44.5 196.5 Q44.5 190 42.5 186 Z',
  },
  center: {
    'thoracic spine': 'M49.3 36 L50.7 36 L50.7 64 L49.3 64 Z',
  },
}

/** Deep muscles with no surface shape; listed beside the map instead. */
export const NOT_DRAWN = ['subscapularis', 'transverse abdominis', 'glute min', 'deep hip rotators', 'toe flexors', 'heart and lungs']
