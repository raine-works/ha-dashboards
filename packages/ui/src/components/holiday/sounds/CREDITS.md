# Holiday sounds

Short clips the holiday easter eggs play (`../holidaySounds.ts`): every one from [Freesound](https://freesound.org)
under **Creative Commons 0** (public domain dedication: free to use, change and share, no attribution required),
listed here anyway. Each was trimmed to its first seconds from the first sound, faded out, made mono and
loudness-matched (EBU R128, -16 LUFS), and encoded as 64 kbps MP3.

| File | Freesound sound | By |
| :--- | :--- | :--- |
| `halloween-owl.mp3` | [R01-27-Great Horned Owl Hoot](https://freesound.org/people/craigsmith/sounds/479588/) (from 1.7s, 3.4s of it) | craigsmith |
| `christmas-bells.mp3` | [Sleigh bells hit](https://freesound.org/people/Selector/sounds/369506/) | Selector |
| `new-year-horn.mp3` | [Party horn](https://freesound.org/people/audiosmedia/sounds/170583/) | audiosmedia |
| `new-year-cork.mp3` | [Champagne Cork](https://freesound.org/people/KenRT/sounds/392624/) | KenRT |
| `independence-day-fireworks.mp3` | [fireworks exploding 1](https://freesound.org/people/soundmary/sounds/117616/) | soundmary |
| `thanksgiving-gobble.mp3` | [Turkey - Gobble](https://freesound.org/people/JarredGibb/sounds/233123/) | JarredGibb |
| `valentines-smooch.mp3` | [Cartoon Smooch](https://freesound.org/people/Breviceps/sounds/444493/) | Breviceps |
| `st-patricks-coins.mp3` | [coinBag](https://freesound.org/people/tomf_/sounds/121990/) | tomf_ |
| `easter-chirp.mp3` | [titmouse call](https://freesound.org/people/seth-m/sounds/271150/) | seth-m |
| `mothers-day-nightingale.mp3` | [Nightingale 23](https://freesound.org/people/qubodup/sounds/854987/) | qubodup |
| `fathers-day-sizzle.mp3` | [Meat Slap & Sizzle](https://freesound.org/people/zar.265/sounds/581640/) | zar.265 |

A new clip: a CC0 sound (Freesound's search filtered to Creative Commons 0), a row here, its import in the
holiday's module beside it (`halloween.ts`; a holiday with several plays one at random, New Year's horn or cork), and the same
processing, with `MAX` the seconds to keep (the owl starts at 1.7s: `-ss 1.7` before `-i`) and `FADE` a quarter of the clip, at most 0.25:

```sh
ffmpeg -i in.mp3 -af "silenceremove=start_periods=1:start_threshold=-40dB,atrim=0:MAX,asetpts=N/SR/TB" -ac 1 -ar 44100 tmp.wav
ffmpeg -i tmp.wav -af "afade=t=out:st=<length - FADE>:d=FADE,loudnorm=I=-16:TP=-1.5:LRA=11,aresample=44100" \
  -ac 1 -codec:a libmp3lame -b:a 64k out.mp3
```
