import type { Difficulty, PromptWord, Theme } from "./types";

/**
 * Starter prompt words, used to generate supabase/seed.sql
 * (`npm run db:seed:generate`). After launch, words are managed from the admin page.
 *
 * One word per line:  word | e/m/h | theme,theme | rhyme; rhyme; rhyme
 * Rhyme hints may be slant rhymes or short phrases, the way rappers actually rhyme.
 */
const RAW = `
cash|e|money|stash; flash; crash
gold|e|money|bold; cold; sold
rich|e|money|switch; pitch; glitch
bank|e|money|tank; thank; frank
paid|e|money,hustle|made; fade; blade
dough|e|money,food|flow; glow; show
deal|e|money,hustle|real; steal; wheel
bills|e|money|skills; thrills; chills
chips|e|money,food|ships; trips; lips
stack|e|money|back; track; black
spend|e|money|friend; trend; blend
broke|e|money,hustle|joke; choke; spoke
price|e|money|ice; dice; nice
rent|e|money,city|spent; bent; tent
loan|e|money|phone; throne; zone
wallet|m|money|call it; ball it; haul it
dollar|m|money|holler; collar; scholar
treasure|m|money|pleasure; measure; leisure
fortune|m|money|portion; torture; scorchin'
budget|m|money|nudge it; judge it; fudge it
credit|m|money|said it; edit; get it
savings|m|money|cravings; engravings; paving
receipt|m|money,food|repeat; complete; elite
wealthy|m|money|healthy; stealthy; selfie
jackpot|m|money,party|backdrop; crack shot; black top
invest|m|money,hustle|the best; progress; impress
payday|m|money|mayday; heyday; replay
inflation|m|money|nation; station; elation
empire|m|money,hustle|vampire; campfire; umpire
millionaire|h|money|billionaire; questionnaire; in the air
entrepreneur|h|money,hustle|connoisseur; saboteur; provocateur
economy|h|money|astronomy; autonomy; anatomy
lottery|h|money|pottery; robbery; snobbery
commission|h|money,hustle|ambition; position; mission
cryptocurrency|h|money,tech|urgency; emergency; insurgency
monopoly|h|money|properly; probably; philosophy

heart|e|love|start; art; apart
kiss|e|love|miss; bliss; this
love|e|love|above; glove; dove
rose|e|love,nature|close; flows; goes
date|e|love|late; wait; great
crush|e|love|rush; blush; hush
hug|e|love|bug; mug; snug
ring|e|love,sports|sing; king; bring
sweet|e|love,food|beat; heat; feet
true|e|love|blue; through; you
cute|e|love|suit; root; shoot
flame|e|love|game; name; fame
honey|e|love,food,nature|money; funny; sunny
forever|m|love|never; clever; together
romance|m|love,party|dance; chance; glance
valentine|m|love|mine; shine; design
passion|m|love|fashion; crashin'; action
promise|m|love|honest; on this; bomb is
devotion|m|love|ocean; emotion; motion
jealous|m|love|zealous; tell us; sell us
breakup|m|love|wake up; make up; shake up
soulmate|m|love|cold plate; roll late; hold weight
whisper|m|love|crisper; sister; mister
chemistry|m|love|mystery; history; victory
loyalty|m|love,hustle|royalty; toil for me
sweetheart|m|love|street art; complete art; repeat part
heartbeat|m|love,music|car seat; start heat; part neat
affection|h|love|connection; direction; perfection
infatuation|h|love|situation; conversation; dedication
companion|h|love|canyon; abandon; stand in
serenade|h|love,music|lemonade; masquerade; escapade
cupid|h|love|stupid; lucid; you did
destiny|h|love|rest of me; best of me; next to me

ball|e|sports|wall; call; fall
goal|e|sports|soul; roll; control
win|e|sports|spin; grin; begin
team|e|sports|dream; steam; scheme
race|e|sports|chase; space; face
dunk|e|sports|funk; trunk; junk
kick|e|sports|quick; slick; brick
score|e|sports|more; floor; roar
run|e|sports|sun; fun; done
jump|e|sports|pump; bump; stump
coach|e|sports|approach; poach; encroach
champ|e|sports|camp; stamp; lamp
court|e|sports|sport; short; report
gym|e|sports|swim; him; trim
sweat|e|sports|bet; set; threat
fans|e|sports,music|hands; stands; plans
medal|e|sports|pedal; metal; settle
trophy|m|sports|show me; know me; slowly
rookie|m|sports|cookie; bookie; hooky
playoffs|m|sports|day off; way off; pay off
overtime|m|sports|so divine; flow in line; show the sign
stadium|m|sports|radium; palladium
referee|m|sports|guarantee; set me free; never me
marathon|m|sports|carry on; paragon; far along
dribble|m|sports|nibble; scribble; quibble
tackle|m|sports|shackle; crackle; cackle
sprinter|m|sports|winter; splinter; printer
hat trick|m|sports|that trick; bad kick; flat brick
league|m|sports|fatigue; intrigue
skateboard|m|sports|great sword; state board; eight chords
victory|h|sports|history; mystery; contradictory
athletic|h|sports|pathetic; magnetic; aesthetic
competition|h|sports,hustle|position; tradition; intuition
determination|h|sports,hustle|dedication; celebration; motivation
heavyweight|h|sports|steady state; petty hate; ready, wait

pizza|e|food|Ibiza; Visa; Mona Lisa
cake|e|food|bake; make; shake
fries|e|food|eyes; prize; size
rice|e|food|price; ice; nice
bread|e|food,money|head; said; red
soup|e|food|loop; group; hoop
steak|e|food|cake; break; take
toast|e|food|most; ghost; coast
spice|e|food|nice; dice; slice
grill|e|food|chill; skill; thrill
chicken|e|food|kickin'; stickin'; tickin'
burger|e|food|merger; burglar
cookie|e|food|rookie; bookie; hooky
juice|e|food|loose; goose; use
candy|e|food|handy; dandy; sandy
taco|m|food|macho; nacho; Waco
noodles|m|food|poodles; oodles; doodles
pancakes|m|food|hand shakes; man makes; can't wait
cereal|m|food|material; imperial; serial
lemonade|m|food|parade; escapade; homemade
avocado|m|food|bravado; desperado; El Dorado
spaghetti|m|food|confetti; ready; yeti
pepper|m|food|stepper; rep her; let her
popcorn|m|food|top form; shop worn
milkshake|m|food|silk cake; will take; still make
buffet|m|food|café; today; okay
dessert|m|food|hurt; shirt; alert
appetite|h|food|rap tonight; happy night; that's a bite
seasoning|h|food|reasoning; treason in; breezing in
ingredients|h|food|obedience; expedience; convenience
delicious|h|food|ambitious; suspicious; vicious
breakfast|h|food|reckless; check this; necklace

street|e|city|beat; feet; heat
block|e|city|clock; rock; lock
train|e|city|rain; lane; brain
lights|e|city|nights; heights; flights
bridge|e|city|fridge; ridge; privilege
tower|e|city|power; hour; shower
alley|e|city|valley; rally; tally
hood|e|city|good; wood; could
city|e|city|pretty; witty; gritty
cab|e|city|grab; lab; tab
corner|m|city|mourner; for her; born a
subway|m|city|run away; club day; what they say
traffic|m|city|graphic; have it; magic
skyline|m|city|my line; high time; fly sign
downtown|m|city|round town; crown now; sound down
taxi|m|city|ask me; max me; flashy
concrete|m|city|on beat; strong feet; complete
graffiti|m|city,music|Tahiti; greedy; needy
siren|m|city|iron; tyrant; fire in
neighbor|m|city|labor; favor; later
penthouse|m|city,money|friend's house; ten thou
avenue|m|city|had a few; back at you; grab a few
neighborhood|m|city|made it good; stayed for good; play it good
apartment|m|city|department; heart went; car rent
rooftop|m|city|new spot; true top; shoe shop
pavement|m|city|basement; engagement
sidewalk|m|city|night walk; side talk; ride off
metropolis|h|city|acropolis; top of this; stop with this
skyscraper|h|city|fly paper; high caper; I paid her
boulevard|h|city|school yard; rule it hard; full of cards

dance|e|party,music|chance; glance; stance
club|e|party|hub; rub; dub
sip|e|party,food|trip; grip; flip
vibe|e|party|tribe; scribe; describe
crowd|e|party,music|loud; proud; cloud
lit|e|party|hit; spit; fit
night|e|party|light; right; flight
glow|e|party|show; flow; slow
fun|e|party|sun; run; done
shine|e|party|line; fine; mine
pop|e|party,music|top; drop; stop
groove|e|party,music|move; smooth; prove
celebrate|m|party|elevate; separate; let it wait
birthday|m|party|first day; worst day; thirsty
weekend|m|party|deep end; sneak in; leakin'
confetti|m|party|spaghetti; ready; steady
balloon|m|party|soon; moon; tune
costume|m|party|lost you; cost you; boss room
karaoke|m|party,music|okey-dokey; hokey; smokey
disco|m|party,music|San Francisco; this flow; risk so
anthem|m|party,music|handsome; ransom; phantom
spotlight|m|party,music|hot night; not right; top flight
dancefloor|m|party,music|can't ignore; stand for more
VIP|m|party,money|degree; guarantee
afterparty|h|party|hearty; smarty; harder, see
masquerade|h|party|serenade; lemonade; escapade
celebration|h|party|situation; dedication; elation
invitation|h|party|imitation; irritation; station
limousine|h|party,cars|in between; magazine; gasoline

rain|e|nature|pain; lane; chain
sun|e|nature|fun; run; one
moon|e|nature|soon; tune; June
tree|e|nature|free; see; key
sky|e|nature|fly; high; why
fire|e|nature|higher; wire; desire
snow|e|nature|flow; glow; slow
wind|e|nature|grinned; pinned; skinned
storm|e|nature|warm; form; swarm
lion|e|nature|tryin'; flyin'; iron
shark|e|nature|dark; park; spark
ocean|m|nature|motion; emotion; potion
river|m|nature|shiver; deliver; quiver
mountain|m|nature|fountain; counting
thunder|m|nature|wonder; under; plunder
lightning|m|nature|frightening; tightening; brightening
forest|m|nature|chorus; for us; before us
jungle|m|nature|humble; rumble; bungle
eagle|m|nature|legal; regal; illegal
earthquake|m|nature|first take; worst mistake
rainbow|m|nature|same flow; main show; game show
butterfly|m|nature|other guy; utter lie; mother, why
blossom|m|nature|awesome; possum; toss 'em
sunrise|m|nature|one size; young guys; surprise
volcano|h|nature|say no; stay low; play though
tornado|h|nature|potato; Play-Doh; stay though
hurricane|h|nature|entertain; in the lane; sugarcane
waterfall|h|nature|caught it all; bought it all; got it all
galaxy|h|nature,tech|fallacy; salary; calorie
avalanche|h|nature|have a chance; rap and dance

phone|e|tech|zone; throne; alone
code|e|tech|road; load; mode
app|e|tech|rap; map; snap
screen|e|tech|clean; mean; scene
click|e|tech|quick; slick; stick
chip|e|tech|ship; grip; flip
glitch|e|tech|switch; rich; pitch
wifi|m|tech|hi-fi; sci-fi; why lie
robot|m|tech|no shot; slow drop; so hot
laptop|m|tech|backdrop; flat top; rap stop
password|m|tech|last word; fast word; bad word
selfie|m|tech|healthy; wealthy; stealthy
download|m|tech|slow down; showdown; throw down
hacker|m|tech|slacker; backer; attacker
pixel|m|tech|nickel; fix all; tricks will
battery|m|tech|flattery; salary
gadget|m|tech|had it; have it; jab it
hashtag|m|tech|cash bag; trash bag; flash flag
emoji|m|tech|OG; slowly; go free
streaming|m|tech,music|dreaming; screaming; scheming
viral|m|tech|spiral; survival; tribal
bluetooth|m|tech|new truth; true youth; two booths
computer|m|tech|tutor; scooter; commuter
virtual|h|tech|virtue; hurt you; curve to
algorithm|h|tech|rhythm; with 'em; give 'em
satellite|h|tech|that's alright; battle night; rattle mic
digital|h|tech|pivotal; critical; spit it all
artificial|h|tech|official; beneficial; initial
internet|h|tech|winner yet; dinner set; in a sec

beat|e|music|heat; street; feet
mic|e|music|like; strike; bike
bass|e|music|place; face; space
rhyme|e|music|time; climb; prime
flow|e|music|go; show; pro
song|e|music|long; strong; wrong
verse|e|music|first; worse; curse
drum|e|music|come; thumb; some
hook|e|music|book; look; shook
stage|e|music|page; rage; age
tune|e|music|soon; moon; June
record|m|music|second; reckoned; wreck it
melody|m|music|felony; sell it, see; tell it, see
rhythm|m|music|with 'em; give 'em; hit 'em
studio|m|music|Julio; moody, though
chorus|m|music|for us; forest; before us
playlist|m|music|play this; stay lit; ways is
headphones|m|music|dead zones; red stones; metronomes
vinyl|m|music|final; spinal; rival
sample|m|music|example; ample; trample
encore|m|music|on four; gone for; long tour
cypher|m|music|lifer; hyper; wiper
lyrics|m|music|spirits; miracles; hear it
harmony|m|music|army; calm me; armory
saxophone|h|music|back alone; tax the loan
symphony|h|music|infamy; in for me; sympathy
microphone|h|music|right at home; like it's known
acoustic|h|music|use it; lose it; choose it
instrumental|h|music|fundamental; sentimental; incidental
crescendo|h|music|innuendo; Nintendo; bend so

grind|e|hustle|mind; find; behind
work|e|hustle|perk; smirk; lurk
dream|e|hustle|team; steam; scheme
boss|e|hustle|loss; cross; toss
rise|e|hustle|eyes; prize; skies
fight|e|hustle|light; right; night
pain|e|hustle|gain; rain; chain
push|e|hustle|bush; whoosh
climb|e|hustle|rhyme; time; prime
struggle|m|hustle|hustle; bubble; double
hustle|m|hustle|muscle; tussle; bustle
focus|m|hustle|notice; lotus; hocus
ambition|m|hustle|mission; position; addition
patience|m|hustle|occasions; nations; vacation
grateful|m|hustle|hateful; faithful; great pull
success|m|hustle|no stress; the best; impress
fearless|m|hustle|peerless; near this; clear this
legend|m|hustle|second; reckoned; seven
pressure|m|hustle|fresher; refresher; less, sir
journey|m|hustle|attorney; turn me; burn me
hungry|m|hustle|country; under me
humble|m|hustle|rumble; stumble; crumble
overcome|m|hustle|over some; so I come; show the drum
legacy|h|hustle|remedy; jealousy; ecstasy
sacrifice|h|hustle|crack the dice; pack of ice; have it nice
motivation|h|hustle|dedication; situation; nation
determined|h|hustle|sermon; burnin'; learnin'
survivor|h|hustle|driver; fiver; thriver
unstoppable|h|hustle|impossible; responsible
independent|h|hustle|descendant; attendant; resplendent
resilience|h|hustle|brilliance; millions; billions

car|e|cars|star; far; bar
ride|e|cars|side; pride; glide
wheels|e|cars|deals; feels; heels
speed|e|cars,sports|need; lead; feed
drive|e|cars|alive; five; thrive
road|e|cars|code; load; mode
engine|m|cars|send him; lend him; ten in
turbo|m|cars|her flow; word, yo; third row
highway|m|cars|my way; Friday; sly way
garage|m|cars|mirage; massage; entourage
convertible|h|cars|reversible; first of all; curse it all
horsepower|h|cars|more power; force power; of course, hour

drip|e|fashion|grip; flip; trip
fresh|e|fashion|mesh; flesh; impress
style|e|fashion|smile; mile; while
kicks|e|fashion,sports|tricks; mix; fix
chain|e|fashion,money|rain; gain; lane
ice|e|fashion,money|price; nice; dice
sneakers|m|fashion|speakers; seekers; keepers
jacket|m|fashion|racket; packet; stack it
designer|m|fashion,money|finer; minor; liner
swagger|m|fashion|stagger; bragger; Jagger
runway|m|fashion|one day; Sunday; fun day
fashion|m|fashion|passion; action; clashin'
`;

const DIFFICULTY_CODES: Record<string, Difficulty> = { e: "easy", m: "medium", h: "hard" };

export function parseStarterWords(raw: string): PromptWord[] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line, index) => {
      const [word, code, themes, hints] = line.split("|").map((part) => part.trim());
      const difficulty = DIFFICULTY_CODES[code];
      if (!word || !difficulty || !themes || !hints) {
        throw new Error(`Bad starter word on line ${index + 1}: "${line}"`);
      }
      return {
        word,
        difficulty,
        themes: themes.split(",").map((t) => t.trim()) as Theme[],
        rhymeHints: hints.split(";").map((h) => h.trim()),
      };
    });
}

export const STARTER_WORDS: PromptWord[] = parseStarterWords(RAW);
