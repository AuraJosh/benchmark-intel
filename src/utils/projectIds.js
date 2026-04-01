export const generateCustomProjectId = (address = '', portalRef = '', coordinates = null) => {
    // Step 1: Postcode Extraction
    const postCodeRegex = /[A-Z]{1,2}[0-9R][0-9A-Z]? [0-9][A-Z]{2}/i;
    const match = address.match(postCodeRegex);
    let postcodePrefix = 'UKN';
    if (match) {
        postcodePrefix = match[0].split(' ')[0];
    }

    // Step 2: Sector Code Designation
    let sectorId = 'OUTSIDE_YORK';
    if (coordinates) {
        const { lat, lng } = coordinates;
        if (lat >= 53.98 && lat <= 54.04) {
            if (lng >= -1.25 && lng < -1.17) sectorId = 'JGL';
            else if (lng >= -1.17 && lng < -1.09) sectorId = 'FGT';
            else if (lng >= -1.09 && lng < -1.01) sectorId = 'TPG';
            else if (lng >= -1.01 && lng <= -0.93) sectorId = 'BHT';
        } else if (lat >= 53.93 && lat < 53.98) {
            if (lng >= -1.25 && lng < -1.17) sectorId = 'MMS';
            else if (lng >= -1.17 && lng < -1.09) sectorId = 'PVM';
            else if (lng >= -1.09 && lng < -1.01) sectorId = 'MKC';
            else if (lng >= -1.01 && lng <= -0.93) sectorId = 'FBG';
        } else if (lat >= 53.88 && lat < 53.93) {
            if (lng >= -1.25 && lng < -1.17) sectorId = 'TGY';
            else if (lng >= -1.17 && lng < -1.09) sectorId = 'MAC';
            else if (lng >= -1.09 && lng < -1.01) sectorId = 'GDF';
            else if (lng >= -1.01 && lng <= -0.93) sectorId = 'HRK';
        }
    }

    // Step 3: Reversed Numbers Logic
    // Extracts exclusively the numerical digits from the portalRef
    const rawNumbers = portalRef.replace(/[^0-9]/g, '');
    
    // Submits this isolated string to a .split('').reverse().join('') function
    const reversedNumbers = rawNumbers.split('').reverse().join('');
    
    let formattedReversed = reversedNumbers;
    
    // "If the reversed number is more than two digits long, it is formatted with a 
    // hyphen preceding the final two digits (e.g., 07641 -> 076-41)"
    if (reversedNumbers.length > 2) {
        const index = reversedNumbers.length - 2;
        formattedReversed = reversedNumbers.slice(0, index) + '-' + reversedNumbers.slice(index);
    }

    // Step 4: Type Digit Mapping
    let typeDigit = '0';
    const upperRef = portalRef.toUpperCase();
    if (upperRef.includes('FUL')) typeDigit = '1';
    else if (upperRef.includes('LHE')) typeDigit = '2';
    else if (upperRef.includes('OUT')) typeDigit = '3';

    // Output: {SectorID}-{FormattedReversedNumbers}-{TypeDigit}
    return `${sectorId}-${formattedReversed}-${typeDigit}`;
};
