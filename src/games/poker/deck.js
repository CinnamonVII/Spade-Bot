const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

class Card {
    constructor(suit, rank) {
        this.suit = suit; 
        this.rank = rank; 
    }

    toString() {
        return `${this.rank}${this.suit}`;
    }

    toEmoji() {
        return `${this.rank}${this.suit}`;
    }

    get value() {
        return RANKS.indexOf(this.rank) + 2;
    }
}

class Deck {
    constructor() {
        this.cards = [];
        this.reset();
    }

    reset() {
        this.cards = [];
        for (const suit of SUITS) {
            for (const rank of RANKS) {
                this.cards.push(new Card(suit, rank));
            }
        }
        this.shuffle();
    }

    shuffle() {
        for (let i = this.cards.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
        }
    }

    draw(count = 1) {
        if (count === 1) return this.cards.pop();
        return this.cards.splice(-count, count);
    }
}

module.exports = { Deck, Card, SUITS, RANKS };
