import assert from "node:assert/strict";
import test from "node:test";
import {
  firstNameOnlyMatches,
  firstNamesMatch,
  isPlaceholderTraveler,
  lastNamesMatch,
  matchTravelerToParty,
  namesReferToSamePerson,
  holderMatchesAddedTraveler,
  sameAddedTraveler,
  sameRecordedTraveler,
} from "./person-match";

test("un prénom parmi plusieurs et un nom à deux caractères près désignent la même personne", () => {
  assert.equal(firstNamesMatch("Jérémy Moïse", "Jeremy"), true);
  assert.equal(firstNamesMatch("Camille Rose", "Camille"), true);
  assert.equal(firstNamesMatch("Noah, Eli, David", "Noah"), true);
  assert.equal(firstNamesMatch("Ali", "Alice"), false);
  assert.equal(lastNamesMatch("Beaumont", "Bbeaummont"), true);
  assert.equal(lastNamesMatch("Beaumont", "Zzzumont"), false);
  assert.equal(lastNamesMatch("Lee", "Lea"), false);
  assert.equal(
    namesReferToSamePerson(
      { first_name: "Jeremy", last_name: "Martin" },
      { first_name: "Jérémy Moïse", last_name: "Martin" }
    ),
    true
  );
  assert.equal(
    namesReferToSamePerson(
      { first_name: "Camille", last_name: "Beaumont" },
      { first_name: "Camille Rose", last_name: "Bbeaummont" }
    ),
    true
  );
});

test("un nom imparfait désigne la même personne", () => {
  assert.equal(
    namesReferToSamePerson(
      { first_name: "Simon", last_name: "Albilia" },
      { first_name: "Simon, Albilia", last_name: null }
    ),
    true
  );
  assert.equal(
    namesReferToSamePerson(
      { first_name: "Simon", last_name: "Albilia" },
      { first_name: "ALBILIA Simon", last_name: null }
    ),
    true
  );
  assert.equal(
    namesReferToSamePerson(
      { first_name: "Simon", last_name: "Albilia" },
      { first_name: "Albilia", last_name: "Simon" }
    ),
    true
  );
  assert.equal(
    namesReferToSamePerson(
      { first_name: "Leoh", last_name: "Albilia" },
      { first_name: "Leo", last_name: "Albilia" }
    ),
    true
  );
  assert.equal(
    namesReferToSamePerson(
      { first_name: "Ali", last_name: "Martin" },
      { first_name: "Alice", last_name: "Martin" }
    ),
    false
  );
});

test("un placeholder et un nom trop différent ne matchent pas", () => {
  assert.equal(isPlaceholderTraveler("Adulte", "2"), true);
  assert.equal(isPlaceholderTraveler("Camille", "2"), false);
  assert.equal(
    namesReferToSamePerson(
      { first_name: "Adulte", last_name: "2" },
      { first_name: "Camille", last_name: "Beaumont" }
    ),
    false
  );
  assert.equal(
    namesReferToSamePerson(
      { first_name: "Louise", last_name: "Moreau" },
      { first_name: "Moreau Ines Claire", last_name: "Moreau Ines Claire" }
    ),
    false
  );
  assert.equal(
    namesReferToSamePerson(
      { first_name: "Louise", last_name: "Moreau" },
      { first_name: "Noah", last_name: "Moreau" }
    ),
    false
  );
});

test("un prénom seul se rattache au foyer, une seule fois", () => {
  assert.equal(firstNameOnlyMatches("Charles-Elie", "Charles Elie John Haim"), true);
  assert.equal(firstNameOnlyMatches("CHARLES ELIE", "Charles-Elie"), true);
  assert.equal(firstNameOnlyMatches("Meryl", "Méryl"), true);
  assert.equal(firstNameOnlyMatches("Elie", "Charles Elie John Haim"), false);
  assert.equal(firstNameOnlyMatches("Nathan", "Nathanael"), false);
  const holder = { first_name: "Nathanaël", last_name: "Martin" };
  const companions = [
    { id: "meryl", first_name: "Méryl", last_name: "Martin" },
    { id: "charles", first_name: "Charles Elie John Haim", last_name: "Martin" },
    { id: "daniel", first_name: "Daniel", last_name: "Martin" },
  ];
  assert.deepEqual(
    matchTravelerToParty({ first_name: "Nathanael", last_name: null }, holder, companions),
    { kind: "holder" }
  );
  assert.deepEqual(
    matchTravelerToParty({ first_name: "Charles-Elie", last_name: "" }, holder, companions),
    { kind: "companion", id: "charles" }
  );
  assert.deepEqual(
    matchTravelerToParty({ first_name: "meryl", last_name: null }, holder, companions),
    { kind: "companion", id: "meryl" }
  );
  assert.equal(
    matchTravelerToParty({ first_name: "Daniel", last_name: null }, holder, [
      ...companions,
      { id: "daniel-2", first_name: "Daniel", last_name: "Bernard" },
    ]),
    null
  );
  assert.equal(
    matchTravelerToParty({ first_name: "Daniel", last_name: null }, { first_name: "Daniel", last_name: "Martin" }, [
      { id: "daniel-2", first_name: "Daniel", last_name: "Bernard" },
    ]),
    null
  );
  assert.equal(
    matchTravelerToParty({ first_name: "Meryl", last_name: "Dupont" }, holder, companions),
    null
  );
  assert.equal(
    matchTravelerToParty({ first_name: "Gary", last_name: null }, holder, companions),
    null
  );
});

test("le rattachement exige un seul candidat", () => {
  const holder = { first_name: "Jérémy Moïse", last_name: "Martin" };
  const companion = {
    id: "c1",
    first_name: "Camille Rose",
    last_name: "Bbeaummont",
  };
  assert.deepEqual(
    matchTravelerToParty({ first_name: "Jeremy", last_name: "Martin" }, holder, [companion]),
    { kind: "holder" }
  );
  assert.deepEqual(
    matchTravelerToParty({ first_name: "Camille", last_name: "Beaumont" }, holder, [companion]),
    { kind: "companion", id: "c1" }
  );
  assert.equal(
    matchTravelerToParty({ first_name: "Adulte", last_name: "2" }, holder, [companion]),
    null
  );
  assert.equal(
    matchTravelerToParty({ first_name: "Camille", last_name: "Martin" }, holder, [
      { id: "a", first_name: "Camille", last_name: "Martin" },
      { id: "b", first_name: "Camille", last_name: "Martin" },
    ]),
    null
  );
  assert.equal(
    matchTravelerToParty({ first_name: "Camille", last_name: "Martin" }, { first_name: "Camille", last_name: "Martin" }, [
      { id: "a", first_name: "Camille", last_name: "Martin" },
    ]),
    null
  );
});

test("le premier prénom et le nom d’usage désignent la même personne", () => {
  assert.equal(
    namesReferToSamePerson(
      { first_name: "Victoria", last_name: "Martin" },
      { first_name: "Victoria Marie Rebecca", last_name: "Tetard", usage_name: "Martin" }
    ),
    true
  );
  assert.equal(
    namesReferToSamePerson(
      { first_name: "Rebecca", last_name: "Martin" },
      { first_name: "Victoria Marie Rebecca", last_name: "Tetard", usage_name: "Martin" }
    ),
    true
  );
});

test("le nom d’épouse désigne la même personne que le nom de naissance", () => {
  assert.equal(
    namesReferToSamePerson(
      { first_name: "Marie", last_name: "Martin" },
      { first_name: "Marie", last_name: "Dupont", usage_name: "Martin" }
    ),
    true
  );
  assert.equal(
    namesReferToSamePerson(
      { first_name: "Marie", last_name: "Dupont", usage_name: "Martin" },
      { first_name: "Claire", last_name: "Martin" }
    ),
    false
  );
});

test("le titulaire ajouté au séjour n’est pas un second compagnon", () => {
  const holder = { first_name: "Camille", last_name: "Martin", birth_date: null };
  assert.equal(
    holderMatchesAddedTraveler(holder, {
      first_name: "Camille Louise",
      last_name: "Martin",
      birth_date: "1988-04-02",
    }),
    true
  );
  assert.equal(
    holderMatchesAddedTraveler(
      { first_name: "Camille Louise", last_name: "Martin", birth_date: "1988-04-02" },
      { first_name: "Camille", last_name: "Martin" }
    ),
    true
  );
  assert.equal(
    holderMatchesAddedTraveler(holder, { first_name: "Louise", last_name: "Martin", birth_date: "2021-03-26" }),
    false
  );
  assert.equal(
    holderMatchesAddedTraveler(
      { first_name: "Camille Louise", last_name: "Martin", birth_date: "1988-04-02" },
      { first_name: "Camille Louise", last_name: "Martin", birth_date: "2021-03-26" }
    ),
    false
  );
  assert.equal(
    holderMatchesAddedTraveler(
      { first_name: "Élise Emmanuelle Alexandra", last_name: "Saada", usage_name: "Chocron" },
      { first_name: "Joseph Elie Jacob", last_name: "Chocron", birth_date: "2022-05-21" }
    ),
    false
  );
});

test("un enfant homonyme ne prend pas la fiche d’un autre Chocron", () => {
  const elise = {
    first_name: "Élise Emmanuelle Alexandra",
    last_name: "Saada",
    usage_name: "Chocron",
    birth_date: "1990-03-12",
  };
  const joseph = {
    first_name: "Joseph Elie Jacob",
    last_name: "Chocron",
    birth_date: "2022-05-21",
  };
  // Le rapprochement des pièces confond encore « Elie » et « Élise ». L’ajout ne s’en sert pas.
  assert.equal(namesReferToSamePerson(joseph, elise), true);
  assert.equal(sameAddedTraveler(elise, joseph), false);
  assert.equal(
    sameAddedTraveler(
      { first_name: "Joseph", last_name: "Chocron", birth_date: "2018-01-04" },
      joseph
    ),
    false
  );
  assert.equal(
    sameAddedTraveler(
      { first_name: "Joseph Elie Jacob", last_name: "Chocron", birth_date: "2022-05-21" },
      joseph
    ),
    true
  );
  assert.equal(
    sameAddedTraveler({ first_name: "Joseph Elie Jacob", last_name: "Chocron", birth_date: null }, joseph),
    false
  );
  assert.equal(sameAddedTraveler({ first_name: "Naomi", last_name: "Chocron" }, { first_name: "", last_name: "Chocron" }), false);
  assert.equal(
    sameAddedTraveler(
      { first_name: "Victoria Marie Rebecca", last_name: "Tetard", usage_name: "Martin" },
      { first_name: "Victoria", last_name: "Martin" }
    ),
    true
  );
});

test("un second import ne dédouble pas la même personne", () => {
  assert.equal(
    sameRecordedTraveler(
      { first_name: "Jeremy", last_name: "Martin" },
      { first_name: "Jérémy Moïse", last_name: "Martin" }
    ),
    true
  );
  assert.equal(
    sameRecordedTraveler(
      { first_name: "Adulte", last_name: "1" },
      { first_name: "Adulte", last_name: "2" }
    ),
    false
  );
});
