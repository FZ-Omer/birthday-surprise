// ✏️ All the personal content lives here. Photos go in assets/photos/, the song in assets/music/.
window.CONFIG = {
  name: "My Love",          // shown in the stars and the finale
  nickname: "Love",         // used in the intro and story
  from: "Umar",
  candles: 5,
  music: "assets/music/song.mp3",

  // one secret per star she has to find in the sky
  reasons: [
    "Your smile fixes my worst days.",
    "You laugh at my jokes, even the bad ones.",
    "You make every place feel like home.",
    "You believe in me more than I do.",
    "Your heart is the kindest I've ever known.",
    "Because life with you is my favourite adventure.",
    "Because you chose me. Every single day.",
  ],

  // the cinematic love story, in order
  memories: [
    { src: "assets/photos/01.jpg", date: "The beginning", title: "The day we met", text: "I didn't know it yet, but my whole life changed that day." },
    { src: "assets/photos/02.jpg", date: "Our first trip", title: "Just us", text: "Lost roads, bad food, best memories." },
    { src: "assets/photos/03.jpg", date: "The big day", title: "Forever started", text: "The day I promised you everything, and meant every word." },
    { src: "assets/photos/04.jpg", date: "Every day since", title: "Our little world", text: "Ordinary days with you are my favourite days." },
  ],

  // extra photos for the swipe-through gallery (leave empty to reuse the memories)
  gallery: [],

  letter:
`My dearest,

Happy birthday to the most beautiful person in my life.
Every day with you feels like a gift I never deserved.

Thank you for your love, your patience, and that laugh I'd cross the world for.
Here's to every birthday still to come, together.

Forever yours,`,
};
