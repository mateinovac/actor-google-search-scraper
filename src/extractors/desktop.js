const { ensureItsAbsoluteUrl } = require('./ensure_absolute_url');
const { extractPeopleAlsoAsk, extractDescriptionAndDate } = require('./extractor_tools');

/**
 * This is the original function, preserved as a fallback in case
 * the new selectors don't work on a different Google page layout.
 */
const extractOrganicResultsOriginal = ($) => {
    // Executed on a single organic result (row)
    const parseResult = (el) => {
        // HOTFIX: Google is A/B testing a new dropdown, which causes invalid results.
        // For now, just remove it.
        $(el).find('div.action-menu').remove();

        const siteLinks = [];

        const siteLinksSelOld = 'ul li';
        const siteLinksSel2020 = '.St3GK a';
        const siteLinksSel2021January = 'table';

        if ($(el).parent().parent().siblings(siteLinksSel2021January).length > 0) {
            $(el).parent().parent().siblings(siteLinksSel2021January)
                .find('td .sld')
                .each((i, siteLinkEl) => {
                    siteLinks.push({
                        title: $(siteLinkEl).find('a').text(),
                        url: $(siteLinkEl).find('a').attr('href'),
                        ...extractDescriptionAndDate($(siteLinkEl).find('.s').text()),
                    });
                });
        } else if ($(el).find(siteLinksSel2020).length > 0) {
            $(el).find(siteLinksSel2020).each((i, siteLinkEl) => {
                siteLinks.push({
                    title: $(siteLinkEl).text(),
                    url: $(siteLinkEl).attr('href'),
                    // Seems Google removed decription in the new layout, let's keep it for now though
                    ...extractDescriptionAndDate($(siteLinkEl).parent('div').parent('h3').parent('div')
                        .find('> div')
                        .toArray()
                        .map((d) => $(d).text())
                        .join(' ') || null),
                });
            });
        } else if ($(el).find(siteLinksSelOld).length > 0) {
            $(el).find(siteLinksSelOld).each((_i, siteLinkEl) => {
                siteLinks.push({
                    title: $(siteLinkEl).find('h3').text(),
                    url: $(siteLinkEl).find('h3 a').attr('href'),
                    ...extractDescriptionAndDate($(siteLinkEl).find('div').text()),
                });
            });
        }

        const productInfo = {};
        const productInfoSelOld = '.dhIWPd';
        const productInfoSel2021January = '.fG8Fp';
        const productInfoText = $(el).find(`${productInfoSelOld}, ${productInfoSel2021January}`).text();
        if (productInfoText) {
            const ratingMatch = productInfoText.match(/Rating: ([0-9.]+)/);
            if (ratingMatch) {
                productInfo.rating = Number(ratingMatch[1]);
            }
            const numberOfReviewsMatch = productInfoText.match(/([0-9,]+) reviews/);
            if (numberOfReviewsMatch) {
                productInfo.numberOfReviews = Number(numberOfReviewsMatch[1].replace(/,/g, ''));
            }

            const priceMatch = productInfoText.match(/\$([0-9.,]+)/);
            if (priceMatch) {
                productInfo.price = Number(priceMatch[1].replace(/,/g, ''));
            }
        }

        const searchResult = {
            title: $(el).find('[data-header-feature="0"] h3').first().text(),
            url: $(el).find('[data-header-feature="0"] a').first().attr('href'),
            displayedUrl: $(el).find('cite').eq(0).text(),
            ...extractDescriptionAndDate($(el).find('[data-content-feature="1"]').text()),
            emphasizedKeywords: $(el).find('.VwiC3b em, .VwiC3b b').map((_i, element) => $(element).text().trim()).toArray(),
            siteLinks,
            productInfo,
        };

        return searchResult;
    };

    // TODO: If you figure out how to reasonably generalize this, you get a medal
    const resultSelectorOld = '.g .rc';
    // We go one deeper to gain accuracy but then we have to go one up for the parsing
    const resultSelector2021January = '.g .tF2Cxc>.yuRUbf';
    const resultSelector2022January = '.g [data-header-feature="0"]';

    let searchResults = [];
    if ($(`${resultSelector2022January}`).length > 0) {
        searchResults = [...$(`${resultSelector2022January}`)].reduce((organicResultsSels, organicResultSel) => {
            // We fetch the list of sub organic results contained in one organic result section
            // It may be hijacking the siteLinks and flattening them into the organicResultsSels
            const subOrganicResultsSels = $(organicResultSel).map((_i, organicItem) => parseResult($(organicItem).parent())).toArray();
            organicResultsSels.push(...subOrganicResultsSels);
            return organicResultsSels;
        }, []);
    }

    if (searchResults.length === 0) {
        searchResults = $(`${resultSelector2021January}`).map((_i, el) => parseResult($(el).parent())).toArray();
    }

    if (searchResults.length === 0) {
        searchResults = $(`${resultSelectorOld}`).map((_index, el) => parseResult(el)).toArray();
    }

    return searchResults;
};

/**
 * This is the new, primary function for extracting organic results.
 * It uses selectors that match the provided HTML file.
 */
exports.extractOrganicResults = ($) => {
    const results = [];
    // This selector targets each organic search result block.
    $('#rso div.tF2Cxc').each((i, el) => {
        const container = $(el);

        const linkEl = container.find('div.yuRUbf a');
        const url = linkEl.attr('href');
        const title = container.find('h3.LC20lb').text();
        const displayedUrl = container.find('cite').text();
        const description = container.find('div.VwiC3b').text();
        const emphasizedKeywords = container.find('em, b').map((_i, element) => $(element).text().trim()).toArray();

        // SiteLinks and ProductInfo are not present in this modern layout, return empty
        const siteLinks = [];
        const productInfo = {};

        if (title && url) {
            results.push({
                title,
                url,
                displayedUrl,
                description,
                emphasizedKeywords,
                siteLinks,
                productInfo,
                position: i + 1,
            });
        }
    });

    // If the new selectors failed, call the original function as a fallback.
    if (results.length === 0) {
        return extractOrganicResultsOriginal($);
    }

    return results;
};

exports.extractPaidResults = ($) => {
    const ads = [];
    // Keeping the old selector just in case.
    const oldAds = $('.ads-fr');
    const newAds = $('#tads > div');

    // Use whatever selector has more results.
    const $ads = newAds.length >= oldAds.length
        ? newAds
        : oldAds;

    $ads.each((_index, el) => {
        const siteLinks = [];
        $(el).find('w-ad-seller-rating').remove();
        $(el).find('a').not('[data-pcu]').not('[ping]')
            .each((_i, siteLinkEl) => {
                siteLinks.push({
                    title: $(siteLinkEl).text(),
                    url: $(siteLinkEl).attr('href'),
                    // Seems Google removed decription in the new layout, let's keep it for now though
                    ...extractDescriptionAndDate(
                        $(siteLinkEl).parent('div').parent('h3').parent('div')
                            .find('> div')
                            .toArray()
                            .map((d) => $(d).text())
                            .join(' ') || null,
                    ),
                });
            });

        const $heading = $(el).find('div[role=heading]');
        const $url = $heading.parent('a');

        // Keeping old description selector for now as it might work on different layouts, remove later
        const $newDescription = $(el).find('.MUxGbd.yDYNvb.lyLwlc > span');
        const $oldDescription = $(el).find('> div > div > div > div > div').eq(1);

        const $description = $newDescription.length > 0 ? $newDescription : $oldDescription;

        ads.push({
            title: $heading.text(),
            url: $url.attr('href'),
            // The .eq(2) fixes getting "Ad." instead of the displayed URL.
            displayedUrl: $url.find('> div > span').eq(2).text(),
            ...extractDescriptionAndDate($description.text()),
            emphasizedKeywords: $description.find('em, b').map((_i, element) => $(element).text().trim()).toArray(),
            siteLinks,
        });
    });

    return ads;
};

exports.extractPaidProducts = ($) => {
    const products = [];

    $('.commercial-unit-desktop-rhs .pla-unit').each((_i, el) => {
        const headingEl = $(el).find('[role="heading"]');
        const siblingEls = headingEl.nextAll();
        const displayedUrlEl = siblingEls.last();
        const prices = [];

        siblingEls.each((_index, siblingEl) => {
            if (siblingEl !== displayedUrlEl[0]) prices.push($(siblingEl).text());
        });

        products.push({
            title: headingEl.text(),
            url: headingEl.find('a').attr('href'),
            displayedUrl: displayedUrlEl.find('span').first().text(),
            prices,
        });
    });

    return products;
};

exports.extractTotalResults = ($) => {
    const wholeString = $('#resultStats').text() || $('#result-stats').text();
    // Remove text in brackets, get numbers as an array of strings from text "Přibližný počet výsledků: 6 730 000 000 (0,30 s)"
    const numberStrings = wholeString.split('(').shift().match(/(\d+(\.|,|\s))+/g);
    // Find the number with highest length (to filter page number values)
    const numberString = numberStrings ? numberStrings.sort((a, b) => b.length - a.length).shift().replace(/[^\d]/g, '') : 0;
    return Number(numberString);
};

exports.extractRelatedQueries = ($, hostname) => {
    const related = [];

    // 2021-02-25 - Tiny change #brs -> #bres
    $('#brs a, #bres a').each((_index, el) => {
        related.push({
            title: $(el).text(),
            url: ensureItsAbsoluteUrl($(el).attr('href'), hostname),
        });
    });

    return related;
};

exports.extractPeopleAlsoAsk = ($) => {
    return extractPeopleAlsoAsk($);
};
