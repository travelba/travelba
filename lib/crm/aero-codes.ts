/**
 * Codes compagnie et aéroport pour le rapprochement AeroAPI.
 * L’ident stocké est IATA (AF7308). AeroAPI range le vol sous l’ident ICAO (AFR7308)
 * et peut ne renvoyer que LFPG / LFMN. On compare les deux écritures.
 */

const AIRLINES = `
AF AFR
KL KLM
DL DAL
BA BAW
LH DLH
LX SWR
OS AUA
SN BEL
SK SAS
AY FIN
EK UAE
QR QTR
EY ETD
TK THY
TO TVF
HV TRA
TB JAF
FR RYR
U2 EZY
DS EZS
EC EJU
IB IBE
VY VLG
UX AEA
TP TAP
AZ ITY
AT RAM
TU TAR
SS CRL
AH DAH
BJ LBT
MS MSR
SV SVA
AA AAL
UA UAL
AC ACA
WS WJA
B6 JBU
WN SWA
AS ASA
NH ANA
JL JAL
KE KAL
OZ AAR
CA CCA
MU CES
CZ CSN
HU CHH
AI AIC
6E IGO
SQ SIA
CX CPA
QF QFA
NZ ANZ
A3 AEE
PC PGT
W6 WZZ
EW EWG
DE CFG
VS VIR
FI ICE
DY NOZ
BT BTI
LO LOT
OK CSA
RO ROT
JU ASL
FB LZB
OU CTN
TX FWI
BF FBU
XK CCM
A5 HOP
V7 VOE
UU REU
CM CMP
AV AVA
AM AMX
LA LAN
AR ARG
FZ FDB
G9 ABY
XY KNE
GF GFA
WY OMA
RJ RJA
ME MEA
ET ETH
KQ KQA
SA SAA
HR HHN
7P PST
EI EIN
TS TSC
WF WIF
`
  .trim()
  .split("\n");

/** IATA → ICAO des aéroports que l’agence sert. BSL, MLH et EAP partagent LFSB. */
const AIRPORTS = `
CDG LFPG
ORY LFPO
BVA LFOB
LBG LFPB
LYS LFLL
NCE LFMN
MRS LFML
TLS LFBO
BOD LFBD
NTE LFRS
RNS LFRN
SXB LFST
MPL LFMT
LIL LFQQ
BES LFRB
BIQ LFBZ
PUF LFBP
PGF LFMP
AJA LFKJ
BIA LFKB
FSC LFKF
CLY LFKC
CMF LFLB
GNB LFLS
TLN LFTH
FNI LFTW
CFE LFLC
ETZ LFJL
LDE LFBT
UIP LFRQ
LRT LFRH
XCR LFOK
BSL LFSB
MLH LFSB
EAP LFSB
LHR EGLL
LGW EGKK
LCY EGLC
STN EGSS
LTN EGGW
MAN EGCC
EDI EGPH
DUB EIDW
AMS EHAM
BRU EBBR
FRA EDDF
MUC EDDM
BER EDDB
HAM EDDH
DUS EDDL
CGN EDDK
STR EDDS
HAJ EDDV
ZRH LSZH
GVA LSGG
VIE LOWW
INN LOWI
PRG LKPR
BUD LHBP
WAW EPWA
KRK EPKK
CPH EKCH
OSL ENGM
ARN ESSA
HEL EFHK
KEF BIKF
LIS LPPT
OPO LPPR
FAO LPFR
FNC LPMA
PDL LPPD
MAD LEMD
BCN LEBL
AGP LEMG
PMI LEPA
IBZ LEIB
ALC LEAL
VLC LEVC
SVQ LEZL
BIO LEBB
TFS GCTS
TFN GCXO
LPA GCLP
ACE GCRR
FUE GCFV
FCO LIRF
CIA LIRA
MXP LIMC
LIN LIML
BGY LIME
VCE LIPZ
NAP LIRN
FLR LIRQ
BLQ LIPE
PSA LIRP
CTA LICC
PMO LICJ
OLB LIEO
CAG LIEE
ATH LGAV
SKG LGTS
HER LGIR
RHO LGRP
JTR LGSR
JMK LGMK
CFU LGKR
IST LTFM
SAW LTFJ
AYT LTAI
ADB LTBJ
ESB LTAC
RAK GMMX
CMN GMMN
AGA GMAD
FEZ GMFF
TNG GMTT
RBA GMME
TUN DTTA
MIR DTMB
DJE DTTJ
NBE DTNH
ALG DAAG
ORN DAOO
CAI HECA
HRG HEGN
SSH HESH
TLV LLBG
AMM OJAI
BEY OLBA
DXB OMDB
AUH OMAA
DOH OTHH
BAH OBBI
KWI OKBK
RUH OERK
JED OEJN
JFK KJFK
EWR KEWR
LGA KLGA
BOS KBOS
IAD KIAD
MIA KMIA
FLL KFLL
MCO KMCO
ATL KATL
ORD KORD
DFW KDFW
IAH KIAH
DEN KDEN
LAX KLAX
SFO KSFO
SAN KSAN
SEA KSEA
LAS KLAS
PHX KPHX
YUL CYUL
YYZ CYYZ
YVR CYVR
MEX MMMX
CUN MMCU
GRU SBGR
GIG SBGL
EZE SAEZ
SCL SCEL
LIM SPJC
BOG SKBO
PTY MPTO
SJU TJSJ
PTP TFFR
FDF TFFF
CAY SOCA
RUN FMEE
MRU FIMP
SEZ FSIA
TNR FMMI
PPT NTAA
BOB NTTB
NOU NWWW
SIN WSSS
BKK VTBS
HKT VTSP
DPS WADD
CGK WIII
KUL WMKK
HKG VHHH
TPE RCTP
NRT RJAA
HND RJTT
KIX RJBB
ICN RKSI
PEK ZBAA
PVG ZSPD
CAN ZGGG
SYD YSSY
MEL YMML
AKL NZAA
DEL VIDP
BOM VABB
MLE VRMM
CPT FACT
JNB FAOR
NBO HKJK
ADD HAAB
LOS DNMM
ACC DGAA
DSS GOBD
`
  .trim()
  .split("\n");

function table(lines: string[]) {
  const forward: Record<string, string> = {};
  const back: Record<string, string> = {};
  for (const line of lines) {
    const [left, right] = line.trim().split(/\s+/);
    if (!left || !right) continue;
    forward[left] = right;
    if (!back[right]) back[right] = left;
  }
  return { forward, back };
}

const airlines = table(AIRLINES);
const airports = table(AIRPORTS);

export function icaoAirline(iata: string) {
  return airlines.forward[iata.trim().toUpperCase()] || "";
}

export function sameAirport(
  wanted: string,
  airport: { iata?: string; icao?: string; code?: string }
) {
  const code = wanted.trim().toUpperCase();
  if (!/^[A-Z0-9]{3,4}$/.test(code)) return false;
  const present = [airport.iata, airport.icao, airport.code]
    .map((value) => (value || "").trim().toUpperCase())
    .filter(Boolean);
  if (present.includes(code)) return true;
  const icao = airports.forward[code];
  if (icao && present.includes(icao)) return true;
  const iata = airports.back[code];
  if (iata && present.includes(iata)) return true;
  for (const value of present) {
    const asIata = airports.back[value];
    if (asIata && asIata === code) return true;
    const asIcao = airports.forward[value];
    if (asIcao && asIcao === code) return true;
  }
  return false;
}
