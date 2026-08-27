// Copyright (C) The Arvados Authors. All rights reserved.
//
// SPDX-License-Identifier: AGPL-3.0

import { getVocabularyFromChips } from './chips';

// Mirrors the shape served by a strict Arvados vocabulary. The root
// `strict_tags` flag restricts which KEYS may be saved, while each tag's own
// `strict` flag restricts that tag's VALUES. The two are independent.
// See doc/admin/metadata-vocabulary.html.textile.liquid
const STRICT_VOCABULARY = {
    strict_tags: true,
    tags: {
        FREETEXT_ID: {
            strict: false,
            labels: [{ label: 'Study Source ID' }],
            values: {},
        },
        NO_STRICT_FLAG: {
            labels: [{ label: 'Theme Number' }],
            values: {},
        },
        CONTROLLED: {
            strict: true,
            labels: [{ label: 'Confidentiality Level' }],
            values: { C1: { labels: [{ label: 'C1' }] } },
        },
    },
};

describe('getVocabularyFromChips', () => {

    it('keeps freetext values for tags declared strict:false', () => {
        expect(getVocabularyFromChips({ 'Study Source ID': 'SRC-99812' }, STRICT_VOCABULARY))
            .to.deep.equal({ FREETEXT_ID: 'SRC-99812' });
    });

    it('keeps freetext values for tags with no strict flag', () => {
        expect(getVocabularyFromChips({ 'Theme Number': 'TH-42' }, STRICT_VOCABULARY))
            .to.deep.equal({ NO_STRICT_FLAG: 'TH-42' });
    });

    it('keeps freetext values inside multi-value tags', () => {
        expect(getVocabularyFromChips({ 'Study Source ID': ['SRC-1', 'SRC-2'] }, STRICT_VOCABULARY))
            .to.deep.equal({ FREETEXT_ID: ['SRC-1', 'SRC-2'] });
    });

    it('maps controlled values to their vocabulary ID', () => {
        expect(getVocabularyFromChips({ 'Confidentiality Level': 'C1' }, STRICT_VOCABULARY))
            .to.deep.equal({ CONTROLLED: 'C1' });
    });

    it('drops values not allowed by a strict:true tag', () => {
        expect(getVocabularyFromChips({ 'Confidentiality Level': 'NotAValue' }, STRICT_VOCABULARY))
            .to.deep.equal({});
    });

    it('drops keys absent from a strict_tags vocabulary', () => {
        expect(getVocabularyFromChips({ 'Not A Key': 'whatever' }, STRICT_VOCABULARY))
            .to.deep.equal({});
    });

    it('preserves every property when freetext and controlled tags are mixed', () => {
        const chips = {
            'Confidentiality Level': 'C1',
            'Study Source ID': 'SRC-99812',
            'Theme Number': 'TH-42',
        };
        const result = getVocabularyFromChips(chips, STRICT_VOCABULARY);
        expect(Object.keys(result)).to.have.lengthOf(3);
        expect(result).to.deep.equal({
            CONTROLLED: 'C1',
            FREETEXT_ID: 'SRC-99812',
            NO_STRICT_FLAG: 'TH-42',
        });
    });
});
