import { Redis } from "@upstash/redis";
import crypto from "node:crypto";

const META_KEY = "pbr:meta";
const PLAYERS_KEY = "pbr:players";
const NAMES_KEY = "pbr:names";

function redisClient() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    const error = new Error("Redis is not configured. Connect an Upstash Redis database to this Vercel project.");
    error.statusCode = 500;
    throw error;
  }
  return new Redis({ url, token });
}

const GUEST_NAMES = [
  "Johan",
  "Tiva",
  "Arne",
  "Stig",
  "Hilde-Kari",
  "Ada",
  "Marte",
  "Eskil",
  "Vivi",
  "Ylva",
  "Vetle",
  "Sissel",
  "Erik",
  "Tiril Celine",
  "Tiril",
  "Marius",
  "Caroline",
  "Vegard",
  "Elisabeth",
  "Ida",
  "Milad",
  "Marthe",
  "Andreas",
  "Christine",
  "Sondre",
  "Josefine",
  "Maren",
  "Idun",
  "Nicolai",
  "Victor",
  "Jens",
  "Charlotte",
  "Joachim",
  "Aksel",
  "Josefin",
  "Anne",
  "Håkon",
  "Hakon",
  "Pernille",
  "Martin",
  "Marie",
  "Ragnhild",
  "Vebjørn",
  "Vebjorn",
  "Julie",
  "Fredrik",
  "Natasha",
  "Ingrid",
  "Thomas",
  "Sindre",
  "Hanne",
  "Espen",
  "Vikrant",
  "Camilla",
  "Hildegunn",
  "Henrik",
  "Cecilie",
  "Sandra",
  "Siri",
  "Amund",
  "Ina Marie",
  "Ina",
  "Jon Gunnar",
  "Jon",
  "Erlend"
];

const POKEMON_HINT_NAMES = [
  "Tiva",
  "Johan",
  "Eskil",
  "Vivi",
  "Sissel",
  "Erik",
  "Arne",
  "Hilde-Kari",
  "Stig"
];

const EUROPEAN_CAPITALS = [
  "Tirana",
  "Andorra la Vella",
  "Jerevan",
  "Yerevan",
  "Baku",
  "Minsk",
  "Brussel",
  "Brussels",
  "Sarajevo",
  "Sofia",
  "København",
  "Copenhagen",
  "Tallinn",
  "Helsingfors",
  "Helsinki",
  "Paris",
  "Tbilisi",
  "Aten",
  "Athen",
  "Athens",
  "Dublin",
  "Reykjavík",
  "Reykjavik",
  "Roma",
  "Rome",
  "Prishtina",
  "Pristina",
  "Priština",
  "Zagreb",
  "Nikosia",
  "Nicosia",
  "Riga",
  "Vaduz",
  "Vilnius",
  "Luxembourg",
  "Valletta",
  "Chisinau",
  "Chișinău",
  "Monaco",
  "Monaco-Ville",
  "Podgorica",
  "Amsterdam",
  "Skopje",
  "Oslo",
  "Warszawa",
  "Warsaw",
  "Lisboa",
  "Lisbon",
  "Bucuresti",
  "București",
  "Bucharest",
  "Moskva",
  "Moscow",
  "San Marino",
  "Beograd",
  "Belgrade",
  "Bratislava",
  "Ljubljana",
  "Madrid",
  "London",
  "Bern",
  "Stockholm",
  "Praha",
  "Prague",
  "Ankara",
  "Berlin",
  "Kyiv",
  "Kiev",
  "Budapest",
  "Vatican City",
  "Città del Vaticano",
  "Wien",
  "Vienna"
];
const NATO_WORDS = [
  "Alfa",
  "Alpha",
  "Bravo",
  "Charlie",
  "Delta",
  "Echo",
  "Foxtrot",
  "Golf",
  "Hotel",
  "India",
  "Juliett",
  "Juliet",
  "Kilo",
  "Lima",
  "Mike",
  "November",
  "Oscar",
  "Papa",
  "Quebec",
  "Romeo",
  "Sierra",
  "Tango",
  "Uniform",
  "Victor",
  "Whiskey",
  "Whisky",
  "X-ray",
  "Xray",
  "Yankee",
  "Zulu",
  "Ærlig",
  "Østen",
  "Åse"
];
const PANCAKE_INGREDIENTS = [
  "mel",
  "flour",
  "hvetemel",
  "wheat flour",
  "salt",
  "melk",
  "milk",
  "egg",
  "eggs",
  "smør",
  "butter",
  "margarin",
  "margarine",
  "vann",
  "water",
  "sukker",
  "sugar"
];
const BEATLES_SONGS = [
  "I Saw Her Standing There",
  "Misery",
  "Anna (Go to Him)",
  "Chains",
  "Boys",
  "Ask Me Why",
  "Please Please Me",
  "Love Me Do",
  "P.S. I Love You",
  "Baby It's You",
  "Do You Want to Know a Secret",
  "A Taste of Honey",
  "There's a Place",
  "Twist and Shout",
  "It Won't Be Long",
  "All I've Got to Do",
  "All My Loving",
  "Don't Bother Me",
  "Little Child",
  "Till There Was You",
  "Please Mister Postman",
  "Roll Over Beethoven",
  "Hold Me Tight",
  "You Really Got a Hold on Me",
  "I Wanna Be Your Man",
  "Devil in Her Heart",
  "Not a Second Time",
  "Money (That's What I Want)",
  "A Hard Day's Night",
  "I Should Have Known Better",
  "If I Fell",
  "I'm Happy Just to Dance with You",
  "And I Love Her",
  "Tell Me Why",
  "Can't Buy Me Love",
  "Any Time at All",
  "I'll Cry Instead",
  "Things We Said Today",
  "When I Get Home",
  "You Can't Do That",
  "I'll Be Back",
  "No Reply",
  "I'm a Loser",
  "Baby's in Black",
  "Rock and Roll Music",
  "I'll Follow the Sun",
  "Mr. Moonlight",
  "Kansas City/Hey-Hey-Hey-Hey!",
  "Eight Days a Week",
  "Words of Love",
  "Honey Don't",
  "Every Little Thing",
  "I Don't Want to Spoil the Party",
  "What You're Doing",
  "Everybody's Trying to Be My Baby",
  "Help!",
  "The Night Before",
  "You've Got to Hide Your Love Away",
  "I Need You",
  "Another Girl",
  "You're Going to Lose That Girl",
  "Ticket to Ride",
  "Act Naturally",
  "It's Only Love",
  "You Like Me Too Much",
  "Tell Me What You See",
  "I've Just Seen a Face",
  "Yesterday",
  "Dizzy Miss Lizzy",
  "Drive My Car",
  "Norwegian Wood (This Bird Has Flown)",
  "You Won't See Me",
  "Nowhere Man",
  "Think for Yourself",
  "The Word",
  "Michelle",
  "What Goes On",
  "Girl",
  "I'm Looking Through You",
  "In My Life",
  "Wait",
  "If I Needed Someone",
  "Run for Your Life",
  "Taxman",
  "Eleanor Rigby",
  "I'm Only Sleeping",
  "Love You To",
  "Here, There and Everywhere",
  "Yellow Submarine",
  "She Said She Said",
  "Good Day Sunshine",
  "And Your Bird Can Sing",
  "For No One",
  "Doctor Robert",
  "I Want to Tell You",
  "Got to Get You into My Life",
  "Tomorrow Never Knows",
  "Sgt. Pepper's Lonely Hearts Club Band",
  "With a Little Help from My Friends",
  "Lucy in the Sky with Diamonds",
  "Getting Better",
  "Fixing a Hole",
  "She's Leaving Home",
  "Being for the Benefit of Mr. Kite!",
  "Within You Without You",
  "When I'm Sixty-Four",
  "Lovely Rita",
  "Good Morning Good Morning",
  "Sgt. Pepper's Lonely Hearts Club Band (Reprise)",
  "A Day in the Life",
  "Magical Mystery Tour",
  "The Fool on the Hill",
  "Flying",
  "Blue Jay Way",
  "Your Mother Should Know",
  "I Am the Walrus",
  "Hello, Goodbye",
  "Strawberry Fields Forever",
  "Penny Lane",
  "Baby, You're a Rich Man",
  "All You Need Is Love",
  "Back in the U.S.S.R.",
  "Dear Prudence",
  "Glass Onion",
  "Ob-La-Di, Ob-La-Da",
  "Wild Honey Pie",
  "The Continuing Story of Bungalow Bill",
  "While My Guitar Gently Weeps",
  "Happiness Is a Warm Gun",
  "Martha My Dear",
  "I'm So Tired",
  "Blackbird",
  "Piggies",
  "Rocky Raccoon",
  "Don't Pass Me By",
  "Why Don't We Do It in the Road?",
  "I Will",
  "Julia",
  "Birthday",
  "Yer Blues",
  "Mother Nature's Son",
  "Everybody's Got Something to Hide Except Me and My Monkey",
  "Sexy Sadie",
  "Helter Skelter",
  "Long, Long, Long",
  "Revolution 1",
  "Honey Pie",
  "Savoy Truffle",
  "Cry Baby Cry",
  "Revolution 9",
  "Good Night",
  "Only a Northern Song",
  "All Together Now",
  "Hey Bulldog",
  "It's All Too Much",
  "Come Together",
  "Something",
  "Maxwell's Silver Hammer",
  "Oh! Darling",
  "Octopus's Garden",
  "I Want You (She's So Heavy)",
  "Here Comes the Sun",
  "Because",
  "You Never Give Me Your Money",
  "Sun King",
  "Mean Mr. Mustard",
  "Polythene Pam",
  "She Came In Through the Bathroom Window",
  "Golden Slumbers",
  "Carry That Weight",
  "The End",
  "Her Majesty",
  "Two of Us",
  "Dig a Pony",
  "Across the Universe",
  "I Me Mine",
  "Dig It",
  "Let It Be",
  "Maggie Mae",
  "I've Got a Feeling",
  "One After 909",
  "The Long and Winding Road",
  "For You Blue",
  "Get Back",
  "From Me to You",
  "Thank You Girl",
  "She Loves You",
  "I'll Get You",
  "I Want to Hold Your Hand",
  "This Boy",
  "Komm, gib mir deine Hand",
  "Sie liebt dich",
  "Long Tall Sally",
  "I Call Your Name",
  "Slow Down",
  "Matchbox",
  "I Feel Fine",
  "She's a Woman",
  "Bad Boy",
  "Yes It Is",
  "I'm Down",
  "Day Tripper",
  "We Can Work It Out",
  "Paperback Writer",
  "Rain",
  "Lady Madonna",
  "The Inner Light",
  "Hey Jude",
  "Revolution",
  "Don't Let Me Down",
  "The Ballad of John and Yoko",
  "Old Brown Shoe",
  "You Know My Name (Look Up the Number)",
  "Free as a Bird",
  "Real Love",
  "Now and Then",
  "12-Bar Original",
  "Ain't She Sweet",
  "All Things Must Pass",
  "Bad to Me",
  "Beautiful Dreamer",
  "Bésame Mucho",
  "Blue Moon",
  "Can You Dig It?",
  "Can You Take Me Back?",
  "Carol",
  "Cayenne",
  "Clarabella",
  "Come and Get It",
  "Cry for a Shadow",
  "Hallelujah, I Love Her So",
  "Hello Little Girl",
  "How Do You Do It?",
  "I'll Be on My Way",
  "I'm in Love",
  "I'm Gonna Sit Right Down and Cry (Over You)",
  "I'm Talking About You",
  "If You've Got Trouble",
  "In Spite of All the Danger",
  "Johnny B. Goode",
  "Junk",
  "Keep Your Hands off My Baby",
  "Leave My Kitten Alone",
  "Lend Me Your Comb",
  "Like Dreamers Do",
  "Los Paranoias",
  "Love of the Loved",
  "Memphis, Tennessee",
  "My Bonnie",
  "Nobody's Child",
  "Not Guilty",
  "Nothin' Shakin'",
  "One and One Is Two",
  "Searchin'",
  "Shout",
  "So How Come (No One Loves Me)",
  "Soldier of Love",
  "Some Other Guy",
  "Sour Milk Sea",
  "Step Inside Love",
  "St. Louis Blues",
  "Sure to Fall (in Love with You)",
  "Sweet Georgia Brown",
  "Sweet Little Sixteen",
  "Take Out Some Insurance on Me, Baby",
  "Teddy Boy",
  "That Means a Lot",
  "Three Cool Cats",
  "To Know Her Is to Love Her",
  "What's the New Mary Jane",
  "You Know What to Do",
  "You'll Be Mine",
  "Young Blood",
  "The Honeymoon Song",
  "Lucille",
  "Lonesome Tears in My Eyes",
  "Ooh! My Soul",
  "Too Much Monkey Business",
  "I Got to Find My Baby",
  "The Hippy Hippy Shake",
  "Glad All Over",
  "Don't Ever Change",
  "Crying, Waiting, Hoping",
  "I Just Don't Understand",
  "A Shot of Rhythm and Blues",
  "That's All Right (Mama)"
];
const QUEEN_SONGS = [
  "Keep Yourself Alive",
  "Doing All Right",
  "Great King Rat",
  "My Fairy King",
  "Liar",
  "The Night Comes Down",
  "Modern Times Rock 'n' Roll",
  "Son and Daughter",
  "Jesus",
  "Seven Seas of Rhye",
  "Procession",
  "Father to Son",
  "White Queen (As It Began)",
  "Some Day One Day",
  "The Loser in the End",
  "Ogre Battle",
  "The Fairy Feller's Master-Stroke",
  "Nevermore",
  "The March of the Black Queen",
  "Funny How Love Is",
  "Brighton Rock",
  "Killer Queen",
  "Tenement Funster",
  "Flick of the Wrist",
  "Lily of the Valley",
  "Now I'm Here",
  "In the Lap of the Gods",
  "Stone Cold Crazy",
  "Dear Friends",
  "Misfire",
  "Bring Back That Leroy Brown",
  "She Makes Me (Stormtrooper in Stilettoes)",
  "In the Lap of the Gods... Revisited",
  "Death on Two Legs (Dedicated to...)",
  "Lazing on a Sunday Afternoon",
  "I'm in Love with My Car",
  "You're My Best Friend",
  "'39",
  "Sweet Lady",
  "Seaside Rendezvous",
  "The Prophet's Song",
  "Love of My Life",
  "Good Company",
  "Bohemian Rhapsody",
  "God Save the Queen",
  "Tie Your Mother Down",
  "You Take My Breath Away",
  "Long Away",
  "The Millionaire Waltz",
  "You and I",
  "Somebody to Love",
  "White Man",
  "Good Old-Fashioned Lover Boy",
  "Drowse",
  "Teo Torriatte (Let Us Cling Together)",
  "We Will Rock You",
  "We Are the Champions",
  "Sheer Heart Attack",
  "All Dead, All Dead",
  "Spread Your Wings",
  "Fight from the Inside",
  "Get Down, Make Love",
  "Sleeping on the Sidewalk",
  "Who Needs You",
  "It's Late",
  "My Melancholy Blues",
  "Mustapha",
  "Fat Bottomed Girls",
  "Jealousy",
  "Bicycle Race",
  "If You Can't Beat Them",
  "Let Me Entertain You",
  "Dead on Time",
  "In Only Seven Days",
  "Dreamer's Ball",
  "Fun It",
  "Leaving Home Ain't Easy",
  "Don't Stop Me Now",
  "More of That Jazz",
  "Play the Game",
  "Dragon Attack",
  "Another One Bites the Dust",
  "Need Your Loving Tonight",
  "Crazy Little Thing Called Love",
  "Rock It (Prime Jive)",
  "Don't Try Suicide",
  "Sail Away Sweet Sister",
  "Coming Soon",
  "Save Me",
  "Flash's Theme",
  "In the Space Capsule (The Love Theme)",
  "Ming's Theme (In the Court of Ming the Merciless)",
  "The Ring (Hypnotic Seduction of Dale)",
  "Football Fight",
  "In the Death Cell (Love Theme Reprise)",
  "Execution of Flash",
  "The Kiss (Aura Resurrects Flash)",
  "Arboria (Planet of the Tree Men)",
  "Escape from the Swamp",
  "Flash to the Rescue",
  "Vultan's Theme (Attack of the Hawk Men)",
  "Battle Theme",
  "The Wedding March",
  "Marriage of Dale and Ming (And Flash Approaching)",
  "Crash Dive on Mingo City",
  "Flash's Theme Reprise (Victory Celebrations)",
  "The Hero",
  "Staying Power",
  "Dancer",
  "Back Chat",
  "Body Language",
  "Action This Day",
  "Put Out the Fire",
  "Life Is Real (Song for Lennon)",
  "Calling All Girls",
  "Las Palabras de Amor (The Words of Love)",
  "Cool Cat",
  "Under Pressure",
  "Radio Ga Ga",
  "Tear It Up",
  "It's a Hard Life",
  "Man on the Prowl",
  "Machines (Or Back to Humans)",
  "I Want to Break Free",
  "Keep Passing the Open Windows",
  "Hammer to Fall",
  "Is This the World We Created...?",
  "One Vision",
  "A Kind of Magic",
  "One Year of Love",
  "Pain Is So Close to Pleasure",
  "Friends Will Be Friends",
  "Who Wants to Live Forever",
  "Gimme the Prize (Kurgan's Theme)",
  "Don't Lose Your Head",
  "Princes of the Universe",
  "Forever",
  "Party",
  "Khashoggi's Ship",
  "The Miracle",
  "I Want It All",
  "The Invisible Man",
  "Breakthru",
  "Rain Must Fall",
  "Scandal",
  "My Baby Does Me",
  "Was It All Worth It",
  "Hang On in There",
  "Chinese Torture",
  "Hijack My Heart",
  "Stealin'",
  "My Life Has Been Saved",
  "Innuendo",
  "I'm Going Slightly Mad",
  "Headlong",
  "I Can't Live with You",
  "Don't Try So Hard",
  "Ride the Wild Wind",
  "All God's People",
  "These Are the Days of Our Lives",
  "Delilah",
  "The Hitman",
  "Bijou",
  "The Show Must Go On",
  "It's a Beautiful Day",
  "Made in Heaven",
  "Let Me Live",
  "Mother Love",
  "I Was Born to Love You",
  "Heaven for Everyone",
  "Too Much Love Will Kill You",
  "You Don't Fool Me",
  "A Winter's Tale",
  "It's a Beautiful Day (Reprise)",
  "Thank God It's Christmas",
  "No-One But You (Only the Good Die Young)",
  "Soul Brother",
  "See What a Fool I've Been",
  "A Human Body",
  "Blurred Vision",
  "A Dozen Red Roses for My Darling",
  "I Go Crazy",
  "Love Kills - The Ballad",
  "Let Me in Your Heart Again",
  "Face It Alone",
  "Dog With a Bone",
  "Feelings, Feelings",
  "Gimme Some Lovin'",
  "Hangman",
  "Hello Mary Lou",
  "I Guess We're Falling Out",
  "Jailhouse Rock",
  "Big Spender"
];
const KILLERS_SONGS = [
  "All the Pretty Faces",
  "All These Things That I've Done",
  "Andy, You're a Star",
  "The Ballad of Michael Valentine",
  "Battle Born",
  "Be Still",
  "Believe Me Natalie",
  "Bling (Confession of a King)",
  "Blowback",
  "Bones",
  "Boots",
  "Boy",
  "Bright Lights",
  "C'est La Vie",
  "The Calling",
  "Carry Me Home",
  "Caution",
  "Change Your Mind",
  "Christmas in L.A.",
  "Cody",
  "The Cowboys' Christmas Ball",
  "A Crippling Blow",
  "Daddy's Eyes",
  "Deadlines and Commitments",
  "Desperate Things",
  "Dirt Sledding",
  "Don't Shoot Me Santa",
  "A Dustland Fairytale",
  "Dying Breed",
  "Enterlude",
  "Everything Will Be Alright",
  "Exitlude",
  "Fire in Bone",
  "Flesh and Bone",
  "For Reasons Unknown",
  "Forget About What I Said",
  "From Here on Out",
  "Get Trashed",
  "The Getting By",
  "The Getting By II",
  "The Getting By III",
  "The Getting By IV",
  "The Getting By V",
  "Glamorous Indie Rock & Roll",
  "Goatsucker",
  "Goodnight, Travel Well",
  "A Great Big Sled",
  "¡Happy Birthday Guadalupe!",
  "Have All the Songs Been Written?",
  "Heart of a Girl",
  "Here with Me",
  "Human",
  "I Can't Stay",
  "I Feel It in My Bones",
  "Imploding the Mirage",
  "In Another Life",
  "In the Car Outside",
  "Jenny Was a Friend of Mine",
  "Joel the Lump of Coal",
  "Joseph, Better You than Me",
  "Joy Ride",
  "Just Another Girl",
  "Land of the Free",
  "Leave the Bourbon on the Shelf",
  "Life to Come",
  "Lightning Fields",
  "Losing Touch",
  "The Man",
  "A Matter of Time",
  "Midnight Show",
  "Miss Atomic Bomb",
  "Money on Straight",
  "Move Away",
  "Mr. Brightside",
  "My God",
  "My List",
  "My Own Soul's Warning",
  "Neon Tiger",
  "On Top",
  "Out of My Mind",
  "Peace of Mind",
  "Prize Fighter",
  "Pressure Machine",
  "Questions with the Captain",
  "Quiet Town",
  "Read My Mind",
  "The Rising Tide",
  "Run for Cover",
  "Runaway Horses",
  "Runaway Horses II",
  "Runaways",
  "Running Towards a Place",
  "Rut",
  "Sam's Town",
  "Shot at the Night",
  "Show You How",
  "Sleepwalker",
  "Smile Like You Mean It",
  "Some Kind of Love",
  "Somebody Told Me",
  "Spaceman",
  "Spaceship Adventure",
  "Spirit",
  "Sweet Talk",
  "Terrible Thing",
  "This Is Your Life",
  "This River Is Wild",
  "Tidal Wave",
  "Tranquilize",
  "Tyson vs Douglas",
  "Uncle Jonny",
  "Under the Gun",
  "The Way It Was",
  "West Hills",
  "West Hills II",
  "West Hills III",
  "When the Dreams Run Dry",
  "When You Were Young",
  "Where the White Boys Dance",
  "A White Demon Love Song",
  "Who Let You Go?",
  "Why Do I Keep Counting?",
  "Wonderful Wonderful",
  "The World We Live In",
  "Your Side of Town",
  "Zombie Hands",
  "Don't Fence Me In",
  "Four Winds",
  "Go All the Way",
  "Hotel California",
  "I'll Be Home for Christmas",
  "Mona Lisas and Mad Hatters",
  "Romeo & Juliet",
  "Ruby, Don't Take Your Love to Town",
  "Shadowplay",
  "Ultraviolet (Light My Way)",
  "Why Don't You Find Out for Yourself"
];
const GEN1_POKEMON = [
  "Bulbasaur",
  "Ivysaur",
  "Venusaur",
  "Charmander",
  "Charmeleon",
  "Charizard",
  "Squirtle",
  "Wartortle",
  "Blastoise",
  "Caterpie",
  "Metapod",
  "Butterfree",
  "Weedle",
  "Kakuna",
  "Beedrill",
  "Pidgey",
  "Pidgeotto",
  "Pidgeot",
  "Rattata",
  "Raticate",
  "Spearow",
  "Fearow",
  "Ekans",
  "Arbok",
  "Pikachu",
  "Raichu",
  "Sandshrew",
  "Sandslash",
  "Nidoran♀",
  "Nidorina",
  "Nidoqueen",
  "Nidoran♂",
  "Nidorino",
  "Nidoking",
  "Clefairy",
  "Clefable",
  "Vulpix",
  "Ninetales",
  "Jigglypuff",
  "Wigglytuff",
  "Zubat",
  "Golbat",
  "Oddish",
  "Gloom",
  "Vileplume",
  "Paras",
  "Parasect",
  "Venonat",
  "Venomoth",
  "Diglett",
  "Dugtrio",
  "Meowth",
  "Persian",
  "Psyduck",
  "Golduck",
  "Mankey",
  "Primeape",
  "Growlithe",
  "Arcanine",
  "Poliwag",
  "Poliwhirl",
  "Poliwrath",
  "Abra",
  "Kadabra",
  "Alakazam",
  "Machop",
  "Machoke",
  "Machamp",
  "Bellsprout",
  "Weepinbell",
  "Victreebel",
  "Tentacool",
  "Tentacruel",
  "Geodude",
  "Graveler",
  "Golem",
  "Ponyta",
  "Rapidash",
  "Slowpoke",
  "Slowbro",
  "Magnemite",
  "Magneton",
  "Farfetch'd",
  "Doduo",
  "Dodrio",
  "Seel",
  "Dewgong",
  "Grimer",
  "Muk",
  "Shellder",
  "Cloyster",
  "Gastly",
  "Haunter",
  "Gengar",
  "Drowzee",
  "Hypno",
  "Krabby",
  "Kingler",
  "Voltorb",
  "Electrode",
  "Exeggcute",
  "Exeggutor",
  "Cubone",
  "Marowak",
  "Hitmonlee",
  "Hitmonchan",
  "Lickitung",
  "Koffing",
  "Weezing",
  "Rhyhorn",
  "Rhydon",
  "Chansey",
  "Tangela",
  "Kangaskhan",
  "Horsea",
  "Seadra",
  "Goldeen",
  "Seaking",
  "Staryu",
  "Starmie",
  "Mr. Mime",
  "Scyther",
  "Jynx",
  "Electabuzz",
  "Magmar",
  "Pinsir",
  "Tauros",
  "Magikarp",
  "Gyarados",
  "Lapras",
  "Ditto",
  "Eevee",
  "Vaporeon",
  "Jolteon",
  "Flareon",
  "Porygon",
  "Omanyte",
  "Omastar",
  "Kabuto",
  "Kabutops",
  "Aerodactyl",
  "Snorlax",
  "Articuno",
  "Zapdos",
  "Moltres",
  "Dratini",
  "Dragonair",
  "Dragonite",
  "Mewtwo",
  "NidoranF",
  "NidoranFemale",
  "NidoranM",
  "NidoranMale"
];
const BRAD_PITT_FILMS = [
  "Hunk",
  "No Man's Land",
  "Less than Zero",
  "No Way Out",
  "The Dark Side of the Sun",
  "Happy Together",
  "Cutting Class",
  "Across the Tracks",
  "Thelma & Louise",
  "Johnny Suede",
  "Cool World",
  "A River Runs Through It",
  "Kalifornia",
  "True Romance",
  "The Favor",
  "Interview with the Vampire",
  "Legends of the Fall",
  "Seven",
  "Se7en",
  "12 Monkeys",
  "Sleepers",
  "The Devil's Own",
  "Seven Years in Tibet",
  "Meet Joe Black",
  "Being John Malkovich",
  "Fight Club",
  "Snatch",
  "The Mexican",
  "Spy Game",
  "Ocean's Eleven",
  "Full Frontal",
  "Confessions of a Dangerous Mind",
  "Sinbad: Legend of the Seven Seas",
  "Abby Singer",
  "Troy",
  "Ocean's Twelve",
  "Mr. & Mrs. Smith",
  "Babel",
  "Ocean's Thirteen",
  "The Assassination of Jesse James by the Coward Robert Ford",
  "Burn After Reading",
  "The Curious Case of Benjamin Button",
  "Inglourious Basterds",
  "Megamind",
  "The Tree of Life",
  "Moneyball",
  "Happy Feet Two",
  "Killing Them Softly",
  "World War Z",
  "12 Years a Slave",
  "The Counselor",
  "Fury",
  "By the Sea",
  "The Big Short",
  "Allied",
  "War Machine",
  "Deadpool 2",
  "Once Upon a Time in Hollywood",
  "Ad Astra",
  "The Lost City",
  "Bullet Train",
  "Babylon",
  "IF",
  "Wolfs",
  "F1",
  "En vampyrs bekjennelser",
  "Høstlegender",
  "Syv",
  "Syv år i Tibet",
  "Troja",
  "Den fantastiske historien om Benjamin Button",
  "Megahjerne",
  "12 år som slave"
];
const WEDDING_ANNIVERSARIES = [
  "papir",
  "paper",
  "bomull",
  "cotton",
  "lær",
  "laer",
  "leather",
  "blomster",
  "blomst",
  "flowers",
  "flower",
  "lin",
  "linen",
  "tre",
  "wood",
  "sukker",
  "sugar",
  "ull",
  "wool",
  "bronse",
  "bronze",
  "pil",
  "willow",
  "keramikk",
  "ceramic",
  "pottery",
  "tinn",
  "tin",
  "stål",
  "stal",
  "steel",
  "silke",
  "silk",
  "knipling",
  "lace",
  "elfenben",
  "ivory",
  "krystall",
  "crystal",
  "porselen",
  "porcelain",
  "sølv",
  "solv",
  "silver",
  "perle",
  "pearl",
  "korall",
  "coral",
  "rubin",
  "ruby",
  "safir",
  "sapphire",
  "gull",
  "gold",
  "golden",
  "smaragd",
  "emerald",
  "diamant",
  "diamond",
  "krondiamant",
  "crown diamond",
  "jern",
  "iron",
  "atom"
];

const SONG_TITLES = [...BEATLES_SONGS, ...QUEEN_SONGS, ...KILLERS_SONGS];

// Rule 11: fixed Norwegian/English answer set for the five pictured animals.
// normalizeLoose() removes spaces, hyphens and punctuation before matching,
// so variants such as "duck-billed platypus" and "duck billed platypus" are equivalent.

const MESTERNES_MESTER_NAMES = [
  "Dag Otto Lauritzen",
  "Stian Grimseth",
  "Gøran Sørloth",
  "Hilde Gjermundshaug Pedersen",
  "Cathrine Roll-Matthiesen",
  "Ole Klemetsen",
  "Ove Aunli",
  "Berit Aunli",
  "Cecilie Brinck Rygel",
  "Daniel Franck",
  "Trine Hattestad",
  "Andrine Flemmen",
  "Espen Bredesen",
  "Bjarte Engen Vik",
  "Jim Marthinsen",
  "Jan Kvalheim",
  "Nina Solheim",
  "Per Egil Ahlsen",
  "Brit Pettersen",
  "Anette Bøe",
  "Finn Christian Jagge",
  "Trine Haltvik",
  "Ailo Gaup",
  "Siren Sundby",
  "Halvard Hanevold",
  "Jorunn Horgen",
  "Frode Rønning",
  "Lene Jenssen",
  "Frode Estil",
  "Kay Stenshjemmet",
  "Tor-Arne Hetland",
  "Sune Wentzel",
  "Roar Strand",
  "Henrik Bjørnstad",
  "Astrid Lødemel",
  "Trude Dybendahl",
  "Linda Grubben",
  "Bente Nordby",
  "Linda Cerup-Simonsen",
  "Thomas Hansvoll",
  "Marco Elsafadi",
  "Johan Remen Evensen",
  "Susann Goksør Bjerkrheim",
  "Erik Solér",
  "Kjersti Grini",
  "Knut Holmann",
  "Gro Espeseth",
  "Kim Rygel",
  "Roger Ruud",
  "Ingrid Kristiansen",
  "Stine Brun Kjeldaas",
  "Aleksander Hetland",
  "Frode Andresen",
  "Mette Solli",
  "Harald Martin Brattbakk",
  "Marit Mikkelsplass",
  "Monica Valen",
  "Lars Bystøl",
  "Jahn Ivar Jakobsen",
  "Pål Gunnar Mikkelsplass",
  "Kari Schibevaag",
  "Tora Berger",
  "Thor Hushovd",
  "Andreas Håtveit",
  "Vibeke Skofterud",
  "Bjørn Maaseide",
  "Ragnhild Gulbrandsen",
  "Jan Åge Fjørtoft",
  "Anne Jahren",
  "Roy Johansen",
  "Anette Sagen",
  "Siri Eftedal Seland",
  "Anders Jacobsen",
  "Helene Olafsen",
  "Tonje Sørlie",
  "Frode Grodås",
  "Else-Marthe Sørlie Lybekk",
  "Eldar Rønning",
  "Anita Moen",
  "Ine Barlie",
  "Odd Sørli",
  "Bartosz Piasecki",
  "Gro Hammerseng-Edin",
  "Espen Jansen",
  "Solveig Gulbrandsen",
  "Isabel Blanco",
  "Andreas Ygre Wiig",
  "Steffen Iversen",
  "Kurt Asle Arvesen",
  "Rolf Falk-Larssen",
  "Lena Boysen Hillestad",
  "Bjørg Eva Jensen",
  "Pål Anders Ullevålseter",
  "Karoline Dyhre Breivang",
  "Hanne Haugland",
  "Glenn Solberg",
  "Tom Hilde",
  "Karina Hollekim",
  "Lars Berger",
  "Kine Olsen Vedelden",
  "Ole Martin Årst",
  "Ann Kristin Flatland",
  "Eirik Verås Larsen",
  "Kjersti Buaas",
  "Ingvill Måkestad Bovim",
  "Margaret Knutson Aase",
  "Odd-Bjørn Hjelmeset",
  "Kari Mette Johansen",
  "Emil Hegle Svendsen",
  "Vidar Riseth",
  "Magnus Moan",
  "Madeleine Enersen Hellerød",
  "Aksel Lund Svindal",
  "Håvard Tvedten",
  "Magnus Midtbø",
  "Anne Margrethe Hausken Nordberg",
  "Synnøve Solemdal",
  "Johann Olav Koss",
  "Linda Medalen",
  "Cecilie Leganger",
  "Genette Våge",
  "Øystein Pettersen",
  "Nils Jakob Hoff",
  "Bjørn Einar Romøren",
  "Øystein Pettersen",
  "Madelene Rubinstein",
  "Anja Hammerseng-Edin",
  "Nadya Khamitskaya Andersen",
  "Ida Njåtun",
  "Linn-Kristin Riegelhuth Koren",
  "Tommy Rustad",
  "Olaf Tufte",
  "Kristin Holte",
  "Andreas Lødrup",
  "Ola Vigen Hattestad",
  "Helene Spilling",
  "Frode Johnsen",
  "Hanne Staff",
  "Linn Jørum Sulland",
  "Stig André Berge",
  "Ezinne Okparaebo",
  "Ole-Kristian Bryhn",
  "Anders Aukland",
  "Pål André Helland",
  "Birgitte Lersbryggen",
  "Marit Malm Frafjord",
  "Camilla Gjersem",
  "Tiril Eckhoff",
  "Terje Håkonsen",
  "Astrid Uhrenholdt Jacobsen",
  "Stian Sivertzen",
  "Hedda Berntsen",
  "Tobias Becs",
  "Tobias Brandal Busæt",
  "Kai Robin Havnaa",
  "Fatima Pinto",
  "Tarik Elyounoussi",
  "Johanne Killi",
  "Gyda Bloch Thorsen",
  "Kristin Harila",
  "Erlend Mamelund",
  "Simen Agdestein",
  "Edvald Boasson-Hagen",
  "Isabell Herlovsen",
  "Daniel-André Tande",
  "Emil Lybekk",
  "Kristin Størmer Steira",
  "Isabelle Pedersen",
  "Jarl Magnus Riiber",
  "Mushaga Bakenga",
  "Marte Olsbu Røiseland",
  "Ayla Ågren"
];

function initialsFromFullName(name) {
  return String(name ?? "")
    .replace(/[«»“”"']/g, "")
    .trim()
    .split(/[\s-]+/u)
    .filter(Boolean)
    .map(part => [...part][0]?.toLocaleUpperCase("nb-NO") || "")
    .join("");
}

const MESTERNES_MESTER_INITIALS = [...new Set(MESTERNES_MESTER_NAMES.map(initialsFromFullName))];

const PICTURE_ANIMALS = [
  // Nebbdyr / platypus
  "nebbdyr",
  "nebdyr",
  "platypus",
  "platipus",
  "duck billed platypus",
  "duck-billed platypus",
  "duckbill platypus",

  // Maurpiggsvin / echidna. Also accept the common variant maurpinnsvin
  // and a few forgiving spellings for the game.
  "maurpiggsvin",
  "maurpinnsvin",
  "maurpinsvin",
  "maur piggsvin",
  "maur pinnsvin",
  "echidna",
  "ekidna",
  "spiny anteater",

  // Leopard
  "leopard",
  "leopart",

  // Sommerfugl / butterfly. Sommerfuggel is a common informal misspelling.
  "sommerfugl",
  "sommerfuggel",
  "sommerfugel",
  "butterfly",

  // Jerv / wolverine
  "jerv",
  "wolverine",
  "wolverin"
];

export const RULES = [
  {
    id: "guest",
    text: "Passordet ditt må inneholde fornavnet på en gjest i bryllupet."
  },
  {
    id: "round2",
    text: "Passordet ditt må inneholde minst én stor bokstav og ett tall, og minst ett romertall."
  },
  {
    id: "round3",
    text: "Passordet ditt må inneholde nøyaktig fem av bokstaven «e», og navnet på en europeisk hovedstad."
  },
  {
    id: "nato",
    text: "Passordet ditt må inneholde minst ett kodeord fra NATOs fonetiske alfabet."
  },
  {
    id: "round5",
    text: "Passordet ditt må inneholde en hovedingrediens i pannekakerøre, og minst én av de syv siste bokstavene i det norske alfabetet."
  },
  {
    id: "animals",
    text: "Passordet ditt må inneholde navnet på minst ett av dyrene som vises på bildene. Norske og engelske navn godkjennes."
  },
  {
    id: "meeting_year",
    text: "Passordet ditt må inneholde årstallet da personene på bildene møtte hverandre for første gang."
  },
  {
    id: "walter",
    text: "Fra og med denne runden må du mate Walter minst én gang i HVER runde før du sender inn passordet ditt. Trykk på Walter for å mate ham. Glemmer du å mate Walter i en senere runde, blir passordet ditt ikke godkjent."
  },
  {
    id: "song",
    text: "Passordet ditt må inneholde navnet på en låt av The Beatles, Queen eller The Killers."
  },
  {
    id: "pokemon",
    text: "Passordet ditt må inneholde navnet på en Pokémon fra de første 150 i Pokédex."
  },
  {
    id: "mesternes",
    text: "Passordet ditt må inneholde initialene til en deltaker fra «Mesternes mester». Initialene må skrives med store bokstaver."
  },
  {
    id: "digit_sum_even",
    text: "Summen av alle sifrene i passordet ditt må være et partall. Hvert siffer adderes separat – for eksempel gir 2018 summen 2 + 0 + 1 + 8 = 11."
  },
  {
    id: "r_count",
    text: "Passordet ditt må avsluttes med et tall som tilsvarer antall bokstaver «r» i passordet."
  },
  {
    id: "rps_majority",
    text: "Passordet ditt må inneholde nøyaktig ett av ordene «stein», «saks» eller «papir». Alternativet eller alternativene som flest deltakere velger, går videre."
  },
  {
    id: "brad_pitt",
    text: "Passordet ditt må inneholde tittelen på en film med Brad Pitt."
  },
  {
    id: "anniversary",
    text: "Passordet ditt må inneholde betegnelsen på et bryllupsjubileum. Du trenger ikke å inkludere ordet «bryllup»."
  }
];

function normalizeLoose(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replaceAll("♀", "female")
    .replaceAll("♂", "male")
    .toLocaleLowerCase("nb-NO")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function containsAnyLoose(password, accepted) {
  const haystack = normalizeLoose(password);
  return accepted.some(value => {
    const needle = normalizeLoose(value);
    return needle && haystack.includes(needle);
  });
}

function hasPokemonHintAccess(playerName) {
  const name = normalizeLoose(playerName);
  return POKEMON_HINT_NAMES.some(value => normalizeLoose(value) === name);
}

function countPlainE(password) {
  return (String(password ?? "").match(/[eE]/g) || []).length;
}

function hasUppercaseLetter(password) {
  return /\p{Lu}/u.test(String(password ?? ""));
}

function hasRomanNumeralSymbol(password) {
  return /[ivxlcdm]/iu.test(String(password ?? ""));
}

function hasLastSevenNorwegianLetter(password) {
  return /[wxyzæøå]/iu.test(String(password ?? ""));
}

function hasMesternesMesterInitials(password) {
  const p = String(password ?? "");
  return MESTERNES_MESTER_INITIALS.some(initials => initials && p.includes(initials));
}

function rCountMatchesEnding(password) {
  const p = String(password ?? "");
  const count = (p.match(/[rR]/g) || []).length;
  const match = p.match(/(\d+)$/);
  if (!match) return false;
  return match[1] === String(count);
}

function digitSumIsEven(password) {
  const digits = String(password ?? "").match(/\d/g) || [];
  const sum = digits.reduce((total, digit) => total + Number(digit), 0);
  return sum % 2 === 0;
}

const RPS_CHOICES = [
  { id: "stein", label: "Stein", aliases: ["stein", "rock"] },
  { id: "saks", label: "Saks", aliases: ["saks", "scissors"] },
  { id: "papir", label: "Papir", aliases: ["papir", "paper"] }
];

export function getRpsChoice(password) {
  const haystack = normalizeLoose(password);
  const matched = RPS_CHOICES.filter(choice =>
    choice.aliases.some(alias => {
      const needle = normalizeLoose(alias);
      return needle && haystack.includes(needle);
    })
  );
  return matched.length === 1 ? matched[0].id : null;
}

export function rpsChoiceLabel(choiceId) {
  return RPS_CHOICES.find(choice => choice.id === choiceId)?.label || choiceId || "";
}

function parseValue(value) {
  if (value == null) return value;
  if (typeof value === "object") return value;
  try { return JSON.parse(value); } catch { return value; }
}

export function defaultMeta() {
  return {
    status: "lobby",
    round: 0,
    roundSeconds: 60,
    deadline: null,
    winner: null,
    winners: [],
    // A new sessionId is created for every full game reset. Clients use this
    // to distinguish rounds in the same game from a completely new game.
    sessionId: crypto.randomUUID(),
    updatedAt: Date.now()
  };
}

export async function getMeta(redis = redisClient()) {
  const raw = await redis.get(META_KEY);
  const parsed = parseValue(raw);

  // First ever load: create and persist one stable session id instead of
  // generating a different id on every GET request.
  if (!parsed) {
    const initial = defaultMeta();
    await redis.set(META_KEY, JSON.stringify(initial));
    return initial;
  }

  // Safe migration for an already-running wedding game created before
  // sessionId existed. Add an id without resetting players or round state.
  if (!parsed.sessionId) {
    const upgraded = { ...parsed, sessionId: crypto.randomUUID(), updatedAt: Date.now() };
    await redis.set(META_KEY, JSON.stringify(upgraded));
    return upgraded;
  }

  return parsed;
}

export async function setMeta(meta, redis = redisClient()) {
  const value = { ...meta, updatedAt: Date.now() };
  await redis.set(META_KEY, JSON.stringify(value));
  return value;
}

export async function getPlayers(redis = redisClient()) {
  const raw = await redis.hgetall(PLAYERS_KEY);
  if (!raw) return [];
  return Object.entries(raw).map(([id, value]) => {
    const player = parseValue(value) || {};
    return { id, ...player };
  });
}

export async function getPlayer(id, redis = redisClient()) {
  if (!id) return null;
  const raw = await redis.hget(PLAYERS_KEY, id);
  if (!raw) return null;
  return { id, ...(parseValue(raw) || {}) };
}

export async function savePlayer(player, redis = redisClient()) {
  const { id, ...rest } = player;
  await redis.hset(PLAYERS_KEY, { [id]: JSON.stringify(rest) });
}

export function validatePassword(password, round, options = {}) {
  const maxRound = Math.max(0, Math.min(Number(round) || 0, RULES.length));
  const failures = [];
  const p = String(password ?? "");

  if (maxRound >= 1 && !containsAnyLoose(p, GUEST_NAMES)) {
    failures.push("Passordet må inneholde fornavnet på en gjest i bryllupet.");
  }

  if (maxRound >= 2) {
    if (!(hasUppercaseLetter(p) && /\d/.test(p))) {
      failures.push("Passordet må inneholde minst én stor bokstav og ett tall.");
    }
    if (!hasRomanNumeralSymbol(p)) {
      failures.push("Passordet må inneholde minst ett romertall.");
    }
  }

  if (maxRound >= 3) {
    if (countPlainE(p) !== 5) {
      failures.push("Passordet må inneholde nøyaktig fem av bokstaven «e».");
    }
    if (!containsAnyLoose(p, EUROPEAN_CAPITALS)) {
      failures.push("Passordet må inneholde navnet på en europeisk hovedstad.");
    }
  }

  if (maxRound >= 4 && !containsAnyLoose(p, NATO_WORDS)) {
    failures.push("Passordet må inneholde minst ett kodeord fra NATOs fonetiske alfabet.");
  }

  if (maxRound >= 5) {
    if (!containsAnyLoose(p, PANCAKE_INGREDIENTS)) {
      failures.push("Passordet må inneholde en hovedingrediens i pannekakerøre.");
    }
    if (!hasLastSevenNorwegianLetter(p)) {
      failures.push("Passordet må inneholde minst én av de syv siste bokstavene i det norske alfabetet.");
    }
  }

  if (maxRound >= 6 && !containsAnyLoose(p, PICTURE_ANIMALS)) {
    failures.push("Passordet må inneholde navnet på minst ett av dyrene som vises på bildene.");
  }

  if (maxRound >= 7 && !p.includes("2018")) {
    failures.push("Passordet må inneholde årstallet da personene på bildene møtte hverandre for første gang.");
  }

  // Regel 8 (Walter) valideres server-side mot spillerens mater-status for runden.

  if (maxRound >= 9 && !containsAnyLoose(p, SONG_TITLES)) {
    failures.push("Passordet må inneholde navnet på en låt av The Beatles, Queen eller The Killers.");
  }

  if (maxRound >= 10) {
    const standardPokemon = containsAnyLoose(p, GEN1_POKEMON);
    const hintedMew = hasPokemonHintAccess(options.playerName) && containsAnyLoose(p, ["Mew"]);
    if (!(standardPokemon || hintedMew)) {
      failures.push("Passordet må inneholde navnet på en Pokémon fra de første 150 i Pokédex.");
    }
  }

  if (maxRound >= 11 && !hasMesternesMesterInitials(p)) {
    failures.push("Passordet må inneholde initialene til en deltaker fra «Mesternes mester», skrevet med store bokstaver.");
  }

  if (maxRound >= 12 && !digitSumIsEven(p)) {
    failures.push("Summen av alle sifrene i passordet ditt må være et partall. Hvert siffer adderes separat – for eksempel gir 2018 summen 2 + 0 + 1 + 8 = 11.");
  }

  if (maxRound >= 13 && !rCountMatchesEnding(p)) {
    failures.push("Passordet må avsluttes med et tall som tilsvarer antall bokstaver «r» i passordet.");
  }

  if (maxRound >= 14 && !getRpsChoice(p)) {
    failures.push("Passordet må inneholde nøyaktig ett av ordene «stein», «saks» eller «papir».");
  }

  if (maxRound >= 15 && !containsAnyLoose(p, BRAD_PITT_FILMS)) {
    failures.push("Passordet må inneholde tittelen på en film med Brad Pitt.");
  }

  if (maxRound >= 16 && !containsAnyLoose(p, WEDDING_ANNIVERSARIES)) {
    failures.push("Passordet må inneholde navnet på et bryllupsjubileum.");
  }

  return { valid: failures.length === 0, failures };
}

export function publicState(meta, players) {
  return {
    meta,
    rules: RULES.slice(0, meta.round),
    totalRules: RULES.length,
    players: players
      .map(p => ({
        id: p.id,
        name: p.name,
        alive: Boolean(p.alive),
        hasSubmitted: Boolean(p.submission),
        valid: p.submission ? Boolean(p.valid) : null,
        eliminatedRound: p.eliminatedRound ?? null,
        reason: p.reason ?? null
      }))
      .sort((a, b) => Number(b.alive) - Number(a.alive) || a.name.localeCompare(b.name))
  };
}

export function assertHostKey(key) {
  const expected = process.env.HOST_KEY;
  if (!expected) {
    const error = new Error("HOST_KEY is not configured in Vercel.");
    error.statusCode = 500;
    throw error;
  }
  const a = Buffer.from(String(key || ""));
  const b = Buffer.from(String(expected));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    const error = new Error("Incorrect host key.");
    error.statusCode = 401;
    throw error;
  }
}

export function createToken() {
  return crypto.randomBytes(24).toString("base64url");
}

export function createId() {
  return crypto.randomUUID();
}

export async function resetGame(redis = redisClient()) {
  await redis.del(META_KEY);
  await redis.del(PLAYERS_KEY);
  await redis.del(NAMES_KEY);
  return setMeta(defaultMeta(), redis);
}

export function getRedis() {
  return redisClient();
}

export { META_KEY, PLAYERS_KEY, NAMES_KEY };
