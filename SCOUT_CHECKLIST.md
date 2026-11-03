# Event Radar daily checklist

The daily check works through **every** section below, every day. Coverage is Tamil Nadu (all districts), Kerala (all districts), Bengaluru, and online events open to Indian students.

Rules that apply everywhere:
- Only events Jeevan can join: open to students from any college, or the public. Skip events limited to one college's own students, one city's colleges, women-only, or professionals only. If eligibility is unclear, include the event and say so.
- Verify every event on its real page before adding it. Never guess a field. Put source disagreements in `warning`.
- Record which sections were checked and how many events each produced in `data/coverage.json` (see the end of this file).

## A. Re-check what's already in the app
Every upcoming event in `data/events.json`: open its `url` and every `sources` link. Resolve warnings, catch changes (date, venue, deadline, price, registration closed, cancelled, postponed). Remove events that ended more than 14 days ago.

## B. Event platforms (search each one, filter to the regions above)
1. Unstop: hackathons, workshops, competitions in Tamil Nadu, Kerala, Bengaluru, online
2. Devfolio: upcoming hackathons (India, in person and online)
3. Devnovate
4. Hack2skill
5. Reskilll (allhacks: Tamil Nadu, Kerala, Bangalore, online)
6. Knowafest: Tamil Nadu and Kerala categories (hackathons, workshops, symposiums, technical events)
7. Internshala competitions
8. Hackathon Radar: India, Bangalore, Chennai, Kerala
9. Luma: Chennai, Bengaluru, Kochi, Trivandrum, Coimbatore
10. Meetup: technology groups in Chennai, Bengaluru, Kochi, Trivandrum, Coimbatore, Madurai
11. MLH: events in India and online
12. KonfHub and Townscript: tech events in the regions above
13. dev.events: Chennai, Bengaluru, Kochi
14. AllEvents: Nagercoil, Kanyakumari, Trivandrum, Madurai, Tirunelveli tech events
15. Eventopia: eventopia.in/events/state/tamil-nadu and the Kerala state page (works well; good for college hackathons)
16. TheTN.ai hackathon list: thetn.ai/hackathons (Tamil Nadu AI hackathons by city and date)
17. India Hackathons (indiahackathons.com, Bengaluru and online), StartupGrantsIndia events, Scene044 (Chennai meetups)

Note: Unstop, Devnovate, Hackathon Radar and some college sites often can't be loaded by the checker. Find the same event on Eventopia, Knowafest, TheTN.ai or a search result instead, and say so in the coverage notes.

## C. Google developer communities (gdg.community.dev chapter pages)
- Tamil Nadu: GDG Chennai, GDG Cloud Chennai, GDG Coimbatore, GDG Madurai, GDG Trichy, GDG Salem, GDG Tirunelveli (if any)
- Kerala: GDG Thiruvananthapuram, GDG Cloud Trivandrum, GDG Cochin, GDG Kozhikode/Calicut, GDG Thrissur (if any)
- Bengaluru: GDG Bangalore, GDG Cloud Bengaluru
- GDG on Campus chapters in Tamil Nadu and Kerala: search "GDG on Campus" + "Tamil Nadu" / "Kerala" for upcoming events open to other colleges
- Google for Developers: Build with AI, DevFest 2026 listings, Solution Challenge, Google Cloud Study Jams

## D. Government and startup bodies
- StartupTN (Tamil Nadu Startup and Innovation Mission): events, district hackathons, regional hubs (including Kanniyakumari)
- EDII-TN, TANCAM, iTNT Hub, Naan Mudhalvan (Tamil Nadu)
- Kerala Startup Mission (KSUM): events, IEDC activities, Build for India
- ICT Academy (Tamil Nadu and Kerala), ICFOSS (Kerala), Technopark and Infopark events
- Startup Grind: Kanniyakumari, Chennai, Kochi, Trivandrum, Bengaluru
- Karnataka: Bengaluru Tech Summit, KDEM, Startup Karnataka
- National: Smart India Hackathon, MeitY / AICTE / MIC hackathons, Toycathon, Ideathons open to all students

## E. Tech companies and student programs
- Microsoft (Learn Student Ambassadors, Reactor Bengaluru), AWS (student/community days, AWS User Groups Chennai, Kochi, Bengaluru), GitHub (Campus, Constellation), Google Cloud, Intel, IBM, Oracle, Zoho, Freshworks
- Coding platforms: Coding Ninjas, GeeksforGeeks, HackerEarth, HackerRank, CodeChef, Codeforces-adjacent college fests, Scaler, Masai, NIAT/NxtWave
- Community events: FOSSASIA, FOSS United meetups (Chennai, Bengaluru, Kochi, Trivandrum), PyCon India, React/JS/Flutter/Python meetups in the regions above, AI/ML meetups, Hugging Face / LangChain community events

## F. College tech fests and symposiums (open to other colleges)
Search each city for "national level" technical symposiums, hackathons and workshops open to all students:
- Kanyakumari district (Nagercoil, Kumaracoil, Thuckalay, Marthandam): Noorul Islam (NICHE), St. Xavier's Catholic College of Engineering, Ponjesly, Rohini, Arunachala, Bethlahem, Joy University, Stella Mary's, Sun College, Udaya, Mar Ephraem, Holy Cross, Scott Christian, Women's Christian College events open to all
- Tirunelveli / Thoothukudi / Tenkasi: Government College of Engineering Tirunelveli, Francis Xavier, PSN, National Engineering College (Kovilpatti), Mepco Schlenk (Sivakasi), Kalasalingam
- Madurai / Virudhunagar / Dindigul: Thiagarajar College of Engineering, Velammal, KLN, Sethu, PSNA
- Coimbatore / Tiruppur / Erode / Salem: PSG Tech, Amrita, Kumaraguru, SNS, Sri Krishna, KPR, Bannari Amman, KSR, Kongu, Sona
- Trichy / Thanjavur: NIT Trichy (Pragyan, Festember), SASTRA, Saranathan, K. Ramakrishnan
- Chennai and around: IIT Madras (Shaastra), Anna University (Kurukshetra), SRM, VIT Chennai, SSN, Sathyabama, Saveetha, Rajalakshmi, St. Joseph's, Sairam, Panimalar, Hindustan, Easwari, Loyola, MIT Campus
- Vellore / Kanchipuram / Krishnagiri: VIT Vellore (Riviera, GraVITas), and others
- Kerala: CET Trivandrum, Mar Baselios, SCT, IIIT Kottayam, Digital University Kerala, CUSAT, Model Engineering College, Rajagiri, Saintgits, TKM, Amrita (Amritapuri, Kochi), NIT Calicut (Tathva), GEC Thrissur, Sahrdaya, Vidya, MITS, Adi Shankara, Federal Institute (FISAT), IIM Kozhikode
- Bengaluru: IISc, IIIT-B, RVCE, PES, BMS, MSRIT, Christ, Presidency, NHCE, Dayananda Sagar, Reva, Jain

## G. Wide-net searches (run several, vary the wording daily)
- "hackathon" / "workshop" / "tech fest" / "symposium" + each month ahead + each of: Nagercoil, Kanyakumari, Tirunelveli, Madurai, Coimbatore, Chennai, Trichy, Trivandrum, Kochi, Kozhikode, Thrissur, Bengaluru
- "online hackathon India students" + month
- "free workshop" + AI / web development / cloud + Tamil Nadu / Kerala
- "registration open" + hackathon + Tamil Nadu / Kerala

## Coverage log
After the check, write `data/coverage.json`:
```json
{
  "date": "YYYY-MM-DD",
  "sections": {"A": {"checked": true, "found": 0, "updated": 0}, "B": {"checked": true, "found": 0}, "C": {...}, "D": {...}, "E": {...}, "F": {...}, "G": {...}},
  "notes": "anything that couldn't be checked (site down, blocked) and why"
}
```
If a section could not be checked, set `checked: false` and say why in `notes`. Never claim a section was checked when it wasn't.
