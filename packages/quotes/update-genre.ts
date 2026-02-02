import Database from 'better-sqlite3';
const db = new Database('../../data/books.db');

// Update genre for Ibn Taymiyyah books
const result = db.prepare("UPDATE books SET genre = 'wisdom' WHERE author = 'Ibn Taymiyyah'").run();
console.log('Updated', result.changes, 'Ibn Taymiyyah books to genre=wisdom');

// Show current Ibn Taymiyyah books
const books = db.prepare("SELECT id, title, genre, (SELECT COUNT(*) FROM passages WHERE book_id = books.id) as passages FROM books WHERE author = 'Ibn Taymiyyah'").all();
console.log('\nIbn Taymiyyah books in database:');
books.forEach((b: any) => console.log(`  ${b.id}: ${b.title} (${b.passages} passages, genre=${b.genre})`));

db.close();
