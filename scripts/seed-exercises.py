# -*- coding: utf-8 -*-
"""Genera la migración del catálogo de ejercicios de Proa.

Los 120 vienen del catálogo por defecto de ClavaMetrics (los que están
replicados en cada club con is_default). NO se traen los 160 que crearon
clubes clientes: esos son datos de ellos.

Los nombres originales están en inglés. Se traducen acá porque una
biblioteca en inglés, para un preparador de habla hispana, es media
biblioteca: si no encuentra «sentadilla», no la usa.
"""
import json, io

# key | en | es | pt | categoría | músculo | material | complejidad | propósito
E = [
("5_10_5_pro_agility","5-10-5 Pro Agility","5-10-5 Pro Agility","5-10-5 Pro Agility","speed","Tren inferior","Conos","medium","power"),
("90_90_hip_switch","90/90 Hip Switch","Cambio de cadera 90/90","Troca de quadril 90/90","mobility","Caderas",None,"low","warmup"),
("a_skip","A-Skip","A-Skip","A-Skip","speed","Tren inferior",None,"low","power"),
("ab_wheel_rollout","Ab Wheel Rollout","Rueda abdominal","Roda abdominal","core","Core","Rueda","high","strength"),
("acceleration_sprint_10_20_m","Acceleration Sprint (10–20 m)","Sprint de aceleración (10–20 m)","Sprint de aceleração (10–20 m)","speed","Tren inferior",None,"medium","power"),
("airplane_single_leg","Airplane (single-leg)","Avión (a una pierna)","Avião (uma perna)","balance","Glúteos / Cadena posterior",None,"medium","prevention"),
("ankle_dorsiflexion_rock","Ankle Dorsiflexion Rock","Balanceo de dorsiflexión de tobillo","Balanço de dorsiflexão de tornozelo","mobility","Tobillo",None,"low","warmup"),
("atg_split_squat","ATG Split Squat","Zancada ATG","Afundo ATG","prehab","Cuádriceps / Rodilla",None,"medium","prevention"),
("b_skip","B-Skip","B-Skip","B-Skip","speed","Tren inferior",None,"medium","power"),
("back_squat","Back Squat","Sentadilla trasera","Agachamento com barra atrás","strength","Cuádriceps / Glúteos","Barra","high","strength"),
("banded_ankle_mobilization","Banded Ankle Mobilization","Movilización de tobillo con banda","Mobilização de tornozelo com elástico","mobility","Tobillo","Banda","low","warmup"),
("banded_external_rotation","Banded External Rotation","Rotación externa con banda","Rotação externa com elástico","prehab","Manguito rotador","Banda","low","prevention"),
("banded_lateral_walk","Banded Lateral Walk","Caminata lateral con banda","Caminhada lateral com elástico","activation","Glúteo medio","Mini-banda","low","activation"),
("banded_pull_apart","Banded Pull-apart","Apertura con banda","Abertura com elástico","activation","Espalda alta","Banda","low","activation"),
("barbell_row","Barbell Row","Remo con barra","Remada com barra","strength","Espalda alta / Dorsales","Barra","medium","strength"),
("battle_ropes","Battle Ropes","Cuerdas de batalla","Cordas navais","conditioning","Tren superior / Core","Cuerdas","low","conditioning"),
("bear_crawl","Bear Crawl","Marcha del oso","Marcha do urso","core","Core / Hombros",None,"low","strength"),
("bench_press","Bench Press","Press de banca","Supino reto","strength","Pectoral / Tríceps","Barra","medium","strength"),
("bike_intervals","Bike Intervals","Intervalos en bici","Intervalos na bike","conditioning","Cuerpo completo","Bici","medium","conditioning"),
("bike_steady_state","Bike Steady-State","Bici continua","Bike contínua","conditioning","Cuerpo completo","Bici","low","conditioning"),
("bird_dog","Bird Dog","Bird dog","Bird dog","activation","Core / Glúteos",None,"low","activation"),
("bosu_squat","Bosu Squat","Sentadilla en Bosu","Agachamento no Bosu","balance","Tren inferior","Bosu","medium","prevention"),
("box_jump","Box Jump","Salto al cajón","Salto na caixa","power","Tren inferior","Cajón","medium","power"),
("broad_jump","Broad Jump","Salto horizontal","Salto horizontal","power","Tren inferior",None,"medium","power"),
("bulgarian_split_squat","Bulgarian Split Squat","Sentadilla búlgara","Agachamento búlgaro","strength","Cuádriceps / Glúteos","Mancuernas","medium","strength"),
("cable_woodchop","Cable Woodchop","Leñador en polea","Lenhador na polia","core","Oblicuos","Polea","low","strength"),
("calf_raise_bent_knee_soleus","Calf Raise (bent knee / soleus)","Elevación de talón (rodilla flexionada)","Elevação de panturrilha (joelho fletido)","prehab","Sóleo","Escalón","low","prevention"),
("calf_raise_straight_knee","Calf Raise (straight knee)","Elevación de talón (rodilla extendida)","Elevação de panturrilha (joelho estendido)","prehab","Gemelos","Escalón","low","prevention"),
("calf_stretch_wall","Calf Stretch (wall)","Estiramiento de gemelos (pared)","Alongamento de panturrilha (parede)","cooldown","Gemelos","Pared","low","cooldown"),
("cat_camel","Cat-Camel","Gato-camello","Gato-camelo","mobility","Columna",None,"low","warmup"),
("child_s_pose","Child's Pose","Postura del niño","Postura da criança","cooldown","Columna / Dorsales",None,"low","cooldown"),
("clamshell","Clamshell","Almeja","Concha","activation","Glúteo medio","Mini-banda","low","activation"),
("clean_pull","Clean Pull","Tirón de cargada","Puxada de clean","olympic","Cadena posterior","Barra","medium","power"),
("conventional_deadlift","Conventional Deadlift","Peso muerto convencional","Levantamento terra convencional","strength","Cadena posterior","Barra","high","strength"),
("copenhagen_plank","Copenhagen Plank","Plancha Copenhague","Prancha Copenhague","prehab","Aductores","Banco","medium","prevention"),
("couch_stretch","Couch Stretch","Estiramiento de sofá","Alongamento do sofá","cooldown","Flexores de cadera / Cuádriceps","Pared","low","cooldown"),
("countermovement_jump","Countermovement Jump","Salto con contramovimiento","Salto com contramovimento","power","Tren inferior",None,"low","power"),
("dead_bug","Dead Bug","Dead bug","Dead bug","activation","Core",None,"low","activation"),
("deceleration_drill","Deceleration Drill","Ejercicio de desaceleración","Exercício de desaceleração","speed","Tren inferior","Conos","medium","prevention"),
("deep_squat_hold_prying","Deep Squat Hold (prying)","Sentadilla profunda sostenida","Agachamento profundo sustentado","mobility","Caderas / Tobillos",None,"low","warmup"),
("depth_jump","Depth Jump","Salto en profundidad","Salto em profundidade","power","Tren inferior","Cajón","high","power"),
("diaphragmatic_breathing","Diaphragmatic Breathing","Respiración diafragmática","Respiração diafragmática","cooldown","Recuperación",None,"low","cooldown"),
("drop_stick_landing","Drop & Stick Landing","Caída y frenado","Queda e aterrissagem firme","power","Tren inferior","Cajón","low","prevention"),
("eccentric_heel_drop","Eccentric Heel Drop","Descenso excéntrico de talón","Descida excêntrica de calcanhar","prehab","Aquiles / Gemelo","Escalón","low","prevention"),
("flying_sprint_max_velocity","Flying Sprint (max velocity)","Sprint lanzado (velocidad máxima)","Sprint lançado (velocidade máxima)","speed","Tren inferior",None,"high","power"),
("foam_roll_it_band_glutes","Foam Roll IT Band / Glutes","Rodillo: banda iliotibial y glúteos","Rolo: banda iliotibial e glúteos","cooldown","Glúteos / Cara lateral del muslo","Rodillo","low","release"),
("foam_roll_quads","Foam Roll Quads","Rodillo: cuádriceps","Rolo: quadríceps","cooldown","Cuádriceps","Rodillo","low","release"),
("front_plank","Front Plank","Plancha frontal","Prancha frontal","core","Core",None,"low","strength"),
("front_squat","Front Squat","Sentadilla frontal","Agachamento frontal","strength","Cuádriceps","Barra","high","strength"),
("glute_bridge","Glute Bridge","Puente de glúteos","Ponte de glúteos","activation","Glúteos",None,"low","activation"),
("goblet_squat","Goblet Squat","Sentadilla goblet","Agachamento goblet","strength","Cuádriceps / Glúteos","Kettlebell / Mancuerna","low","strength"),
("hamstring_slider_curl","Hamstring Slider Curl","Curl de isquios con deslizadores","Flexão de isquiotibiais com sliders","prehab","Isquiotibiales","Deslizadores","medium","prevention"),
("hang_power_clean","Hang Power Clean","Cargada de potencia desde suspensión","Clean de potência suspenso","olympic","Cuerpo completo","Barra","high","power"),
("hang_power_snatch","Hang Power Snatch","Arranque de potencia desde suspensión","Snatch de potência suspenso","olympic","Cuerpo completo","Barra","high","power"),
("hanging_leg_raise","Hanging Leg Raise","Elevación de piernas colgado","Elevação de pernas suspenso","core","Flexores de cadera / Core","Barra fija","medium","strength"),
("hip_flexor_rock_back","Hip Flexor Rock-back","Balanceo de flexores de cadera","Balanço de flexores de quadril","mobility","Caderas",None,"low","warmup"),
("hip_flexor_stretch","Hip Flexor Stretch","Estiramiento de flexores de cadera","Alongamento de flexores de quadril","cooldown","Flexores de cadera",None,"low","cooldown"),
("hip_thrust","Hip Thrust","Empuje de cadera","Elevação pélvica","strength","Glúteos","Barra","low","strength"),
("hollow_hold","Hollow Hold","Hollow hold","Hollow hold","core","Core",None,"low","strength"),
("hurdle_hops","Hurdle Hops","Saltos sobre vallas","Saltos sobre barreiras","power","Tren inferior","Vallas","medium","power"),
("incline_dumbbell_press","Incline Dumbbell Press","Press inclinado con mancuernas","Supino inclinado com halteres","strength","Pectoral / Hombros","Mancuernas","medium","strength"),
("incline_treadmill_walk","Incline Treadmill Walk","Caminata en cinta inclinada","Caminhada na esteira inclinada","conditioning","Tren inferior","Cinta","low","conditioning"),
("kettlebell_clean","Kettlebell Clean","Cargada con kettlebell","Clean com kettlebell","olympic","Cuerpo completo","Kettlebell","medium","power"),
("kettlebell_swing","Kettlebell Swing","Balanceo con kettlebell","Swing com kettlebell","olympic","Glúteos / Isquiotibiales","Kettlebell","low","power"),
("ladder_quick_feet","Ladder Quick Feet","Escalera de agilidad: pies rápidos","Escada de agilidade: pés rápidos","speed","Tren inferior","Escalera","low","power"),
("lateral_bound","Lateral Bound","Salto lateral","Salto lateral","power","Tren inferior",None,"medium","power"),
("medicine_ball_rotational_throw","Medicine Ball Rotational Throw","Lanzamiento rotacional con balón medicinal","Arremesso rotacional com bola medicinal","power","Core","Balón medicinal","low","power"),
("medicine_ball_slam","Medicine Ball Slam","Golpe con balón medicinal","Arremesso ao solo com bola medicinal","power","Core / Cuerpo completo","Balón medicinal","low","power"),
("monster_walk","Monster Walk","Caminata monster","Caminhada monster","activation","Glúteos","Mini-banda","low","activation"),
("nordic_hamstring_curl","Nordic Hamstring Curl","Curl nórdico de isquios","Flexão nórdica de isquiotibiais","prehab","Isquiotibiales","Compañero","high","prevention"),
("open_book","Open Book","Libro abierto","Livro aberto","mobility","Columna dorsal",None,"low","warmup"),
("overhead_press","Overhead Press","Press militar","Desenvolvimento militar","strength","Hombros","Barra","medium","strength"),
("pallof_press","Pallof Press","Press Pallof","Press Pallof","core","Core","Polea / Banda","low","strength"),
("pigeon_stretch","Pigeon Stretch","Estiramiento de paloma","Alongamento do pombo","cooldown","Glúteos / Caderas",None,"low","cooldown"),
("pogo_hops","Pogo Hops","Saltos pogo","Saltos pogo","power","Gemelos / Tobillo",None,"low","power"),
("power_clean","Power Clean","Cargada de potencia","Clean de potência","olympic","Cuerpo completo","Barra","high","power"),
("prone_y_t_w","Prone Y-T-W","Y-T-W en prono","Y-T-W em prono","activation","Trapecio inferior / Manguito",None,"low","activation"),
("pull_up","Pull-up","Dominada","Barra fixa","strength","Dorsales / Espalda alta","Barra fija","high","strength"),
("push_jerk","Push Jerk","Envión de fuerza","Push jerk","olympic","Hombros / Piernas","Barra","high","power"),
("push_press","Push Press","Press de empuje","Push press","olympic","Hombros / Piernas","Barra","medium","power"),
("quadruped_t_spine_reach","Quadruped T-spine Reach","Alcance torácico en cuadrupedia","Alcance torácico em quatro apoios","mobility","Columna dorsal",None,"low","warmup"),
("resisted_sprint_band_sled","Resisted Sprint (band / sled)","Sprint resistido (banda / trineo)","Sprint resistido (elástico / trenó)","speed","Tren inferior","Banda / Trineo","medium","power"),
("reverse_crunch","Reverse Crunch","Crunch invertido","Abdominal invertido","core","Abdomen inferior",None,"low","strength"),
("reverse_nordic","Reverse Nordic","Nórdico inverso","Nórdico invertido","prehab","Cuádriceps","Colchoneta","medium","prevention"),
("romanian_deadlift","Romanian Deadlift","Peso muerto rumano","Levantamento terra romeno","strength","Isquiotibiales / Glúteos","Barra","medium","strength"),
("rowing_intervals","Rowing Intervals","Intervalos en remo","Intervalos no remo","conditioning","Cuerpo completo","Remo","medium","conditioning"),
("russian_twist","Russian Twist","Giro ruso","Giro russo","core","Oblicuos","Balón medicinal","low","strength"),
("scapular_push_up","Scapular Push-up","Flexión escapular","Flexão escapular","prehab","Serrato",None,"low","prevention"),
("scapular_wall_slide","Scapular Wall Slide","Deslizamiento escapular en pared","Deslizamento escapular na parede","activation","Hombros","Pared","low","activation"),
("shuttle_runs","Shuttle Runs","Carreras de ida y vuelta","Corridas de vai e vem","conditioning","Cuerpo completo","Conos","medium","conditioning"),
("side_plank","Side Plank","Plancha lateral","Prancha lateral","core","Core lateral",None,"low","strength"),
("single_arm_dumbbell_row","Single-Arm Dumbbell Row","Remo a una mano con mancuerna","Remada unilateral com halter","strength","Dorsales / Espalda alta","Mancuerna","low","strength"),
("single_leg_balance","Single-Leg Balance","Equilibrio a una pierna","Equilíbrio em uma perna","balance","Tobillo / Cadera",None,"low","prevention"),
("single_leg_balance_perturbation","Single-Leg Balance + Perturbation","Equilibrio a una pierna con perturbación","Equilíbrio em uma perna com perturbação","balance","Tobillo / Cadera","Banda / Compañero","medium","prevention"),
("single_leg_glute_bridge","Single-Leg Glute Bridge","Puente de glúteos a una pierna","Ponte de glúteos em uma perna","activation","Glúteos",None,"low","activation"),
("single_leg_hop_stick","Single-Leg Hop & Stick","Salto a una pierna con frenado","Salto em uma perna com aterrissagem firme","power","Tren inferior",None,"medium","power"),
("single_leg_rdl","Single-Leg RDL","Peso muerto rumano a una pierna","Levantamento terra romeno unilateral","balance","Isquiotibiales / Glúteos","Mancuerna","medium","prevention"),
("skierg_intervals","SkiErg Intervals","Intervalos en SkiErg","Intervalos no SkiErg","conditioning","Cuerpo completo","SkiErg","medium","conditioning"),
("sled_drag_backward","Sled Drag (backward)","Arrastre de trineo hacia atrás","Arrasto de trenó para trás","conditioning","Cuádriceps / Rodilla","Trineo","low","prevention"),
("sled_push","Sled Push","Empuje de trineo","Empurrada de trenó","conditioning","Cuerpo completo","Trineo","medium","conditioning"),
("spiderman_lunge","Spiderman Lunge","Zancada spiderman","Afundo spiderman","mobility","Caderas / Ingle",None,"low","warmup"),
("squat_jump","Squat Jump","Salto desde sentadilla","Salto a partir do agachamento","power","Tren inferior",None,"low","power"),
("standing_hamstring_stretch","Standing Hamstring Stretch","Estiramiento de isquios de pie","Alongamento de isquiotibiais em pé","cooldown","Isquiotibiales",None,"low","cooldown"),
("step_up","Step-up","Subida al cajón","Subida no banco","strength","Cuádriceps / Glúteos","Mancuernas / Cajón","low","strength"),
("stir_the_pot","Stir the Pot","Revolver la olla","Mexer a panela","core","Core","Fitball","medium","strength"),
("suitcase_carry","Suitcase Carry","Transporte maleta","Carregamento maleta","core","Core / Agarre","Mancuerna / Kettlebell","low","strength"),
("t_drill","T-Drill","Test en T","Teste em T","speed","Tren inferior","Conos","medium","power"),
("tandem_stance_hold","Tandem Stance Hold","Apoyo en tándem","Apoio em tandem","balance","Tobillo / Cadera",None,"low","prevention"),
("tempo_run","Tempo Run","Carrera a ritmo","Corrida em ritmo","conditioning","Cuerpo completo",None,"low","conditioning"),
("thoracic_foam_roll","Thoracic Foam Roll","Rodillo torácico","Rolo torácico","cooldown","Columna dorsal","Rodillo","low","release"),
("thoracic_spine_rotation","Thoracic Spine Rotation","Rotación torácica","Rotação torácica","mobility","Columna dorsal",None,"low","warmup"),
("tibialis_raise","Tibialis Raise","Elevación de tibial","Elevação de tibial","prehab","Tibial","Pared","low","prevention"),
("trap_bar_deadlift","Trap-Bar Deadlift","Peso muerto con barra hexagonal","Levantamento terra com barra hexagonal","strength","Cadena posterior / Cuádriceps","Barra hexagonal","medium","strength"),
("walking_lunge","Walking Lunge","Zancada caminando","Afundo caminhando","strength","Cuádriceps / Glúteos","Mancuernas","low","strength"),
("wall_slides_shoulder","Wall Slides (shoulder)","Deslizamiento en pared (hombro)","Deslizamento na parede (ombro)","mobility","Hombros","Pared","low","warmup"),
("wicket_runs","Wicket Runs","Carreras entre vallas bajas","Corridas entre barreiras baixas","speed","Tren inferior","Vallas bajas","medium","power"),
("wobble_board_hold","Wobble Board Hold","Sostén en plato de equilibrio","Sustentação na prancha de equilíbrio","balance","Tobillo","Plato de equilibrio","low","prevention"),
("world_s_greatest_stretch","World's Greatest Stretch","El mejor estiramiento del mundo","O melhor alongamento do mundo","mobility","Cuerpo completo",None,"low","warmup"),
("wrist_flexor_extensor_eccentrics","Wrist Flexor/Extensor Eccentrics","Excéntricos de muñeca","Excêntricos de punho","prehab","Antebrazo","Mancuerna","low","prevention"),
("y_balance_reach","Y-Balance Reach","Alcance Y-Balance","Alcance Y-Balance","balance","Tren inferior",None,"low","prevention"),
]

def q(v):
    if v is None: return 'null'
    return "'" + v.replace("'", "''") + "'"

rows = ",\n  ".join(
    "(" + ", ".join([q(k), q(en), q(es), q(pt), q(cat), q(mus), q(eq), q(cx), q(pur)]) + ")"
    for (k, en, es, pt, cat, mus, eq, cx, pur) in E
)

sql = """-- Catálogo de ejercicios de Proa: %d entradas.
-- Vienen del catálogo por defecto de ClavaMetrics, traducidas a español y
-- portugués. Los ejercicios que crearon clubes clientes NO se copian.
insert into public.exercises (key, name, name_es, name_pt, category, muscle_group, equipment, complexity, purpose)
values
  %s
on conflict (key) where workspace_id is null do update set
  name = excluded.name, name_es = excluded.name_es, name_pt = excluded.name_pt,
  category = excluded.category, muscle_group = excluded.muscle_group,
  equipment = excluded.equipment, complexity = excluded.complexity,
  purpose = excluded.purpose;
""" % (len(E), rows)

io.open('scripts/_exercises.sql', 'w', encoding='utf-8').write(sql)
print("%d ejercicios · %d categorías · %d con material" % (
    len(E), len(set(r[4] for r in E)), sum(1 for r in E if r[6])))
