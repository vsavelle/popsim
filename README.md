This is a quick vibe coded representation of people going to work, having lunch and going back home. A table is shown representing all movements of agents (people).
It is meant to be used and expanded upon for visualizing location based tracking scenarios. Use it as you wish, I didn't make it, Claude Opus 4.6 did based on my educated guesses as a mighty, epic and based prompt engineer.

This is a 3 minute simulation, representing 24 hours.

<img width="1526" height="1363" alt="popsim_scr1" src="https://github.com/user-attachments/assets/371d75b1-14c2-413a-b3a9-9bf4da20acb8" />

The order of events:
- Starting the simulation spawns 150 agents (people) represented by black dots. The black dots represent sleeping people.
- Agents wake up at a random time in the morning and get ready for work (turning green when waking up). Agents also pick a random eatery as their favorite off the map.
- Agents leave for work and arrive close to hour or half-hour
- Before lunch time, each agent checks wheather their fave place is within 20 tiles from their work. If less than 20 tiles, they will go drive to the eatery 40% of the time.
- Agents whos' fave eatery is too far order for delivery before lunch time, to allow for delivery time
- Delivery drivers are blue dots, they each spend 10 minutes to deliver and then go back to the eatery, where they spawned.
- After lunch, agents continue work until the shit is over, then they either go home or go to leisure activity, then home.
- Agents can go out once again after returning home if time allows, randomly
- All agents end up at home and go to sleep latest by midnight.

After the simulation, a table is presented below, listing all locations and time tables of every place the agent visited, and food that was delivered to them.
Clicking on an agent ID in the table also highlights their movement around the city for the whole day.

More features may be added.

<img width="1542" height="1619" alt="popsim_scr2" src="https://github.com/user-attachments/assets/8be67010-6458-456c-809f-e98e52630dca" />

This entire thing was made to help with showing how location data can erode privacy.

But how do I run this?
**python3 -m http.server 8000**
