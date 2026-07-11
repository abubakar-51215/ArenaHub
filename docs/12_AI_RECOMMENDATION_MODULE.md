# Arena Hub — AI Recommendation and NLP Search Module

**Version:** 2.0

---

## 1. Overview

The AI module provides two capabilities:
1. **NLP Search:** Parse natural language queries into structured search parameters
2. **Arena Recommendations:** Suggest arenas personalized to each player

Both features use lightweight algorithms suitable for an FYP scope without complex ML training pipelines.

---

## 2. NLP Search

### Purpose
Allow players to search using conversational queries instead of selecting individual filters.

### Example Queries
| Query | Extracted Parameters |
|---|---|
| "best football ground near me" | sport=football, sort=rating, location=GPS |
| "cheap cricket arena in Lahore" | sport=cricket, price=low, city=Lahore |
| "indoor badminton court available tonight" | sport=badminton, type=indoor, date=today, time=evening |
| "highest rated futsal arena" | sport=futsal, sort=rating_desc |

### Processing Pipeline
1. Player enters query text
2. System tokenizes the query and converts to lowercase
3. Keyword extraction: match tokens against sport types, city names, area names, price indicators, rating indicators, time references
4. Build structured search parameters from extracted keywords
5. Execute standard arena search with extracted parameters
6. Rank results by relevance score
7. Return ranked arena list

### Keyword Dictionaries
- **Sports:** cricket, football, futsal, badminton, tennis, basketball, volleyball
- **Price indicators:** cheap, affordable, budget → sort by price_asc; expensive, premium → sort by price_desc
- **Rating indicators:** best, highest rated, top → sort by rating_desc
- **Time references:** tonight, today, tomorrow, this weekend → filter by date
- **Location:** "near me" → use GPS; city/area names → filter by location

### Fallback
If NLP cannot extract meaningful parameters → return all arenas sorted by relevance to original query text (full-text search fallback).

---

## 3. Arena Recommendations

### Purpose
Show personalized arena suggestions on the player's home screen and arena detail pages.

### Recommendation Factors

| Factor | Weight | Description |
|---|---|---|
| Location Proximity | High | Arenas closer to player's current or preferred locations |
| Preferred Sports | High | Arenas offering player's preferred sport types |
| Booking History | Medium | Arenas similar to previously booked ones |
| Rating | Medium | Higher-rated arenas preferred |
| Price Range | Low | Arenas within player's typical spending range |

### Algorithm (Content-Based Filtering)
```
For each arena:
  score = 0
  score += proximity_score(player_location, arena_location) * 0.3
  score += sport_match_score(player_preferred_sports, arena_sports) * 0.3
  score += history_similarity_score(player_bookings, arena) * 0.2
  score += normalize(arena.average_rating) * 0.1
  score += price_fit_score(player_avg_spend, arena.avg_price) * 0.1

Sort arenas by score descending
Return top 10 recommendations
```

### Display Locations
- **Home Screen:** "Recommended for You" section
- **Arena Detail Page:** "You Might Also Like" section
- **Search Results:** "Recommended" badge on qualifying arenas
- **Fully Booked Arena:** "Try These Nearby Alternatives" section

---

## 4. Scope Limitations

To keep the FYP manageable:
- No complex ML models or neural networks
- No heavy training datasets required
- Keyword-based NLP (not deep learning NLP)
- Content-based filtering (not collaborative filtering)
- All processing happens on the server (no separate ML service)

---

End of Document
