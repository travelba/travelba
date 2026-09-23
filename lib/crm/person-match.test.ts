import assert from "node:assert/strict";
import test from "node:test";
import {
  firstNamesMatch,
  isPlaceholderTraveler,
  lastNamesMatch,
  matchTravelerToParty,
  namesReferToSamePerson,
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
