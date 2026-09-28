<?php

declare(strict_types=1);

use TYPO3\CMS\Core\Resource\AbstractFile;
use TYPO3\CMS\Core\Utility\ExtensionManagementUtility;

defined('TYPO3') or die();

(static function (): void {
    $ll = 'LLL:EXT:pageflipper/Resources/Private/Language/locallang_db.xlf:';

    ExtensionManagementUtility::addTCAcolumns('sys_file_reference', [
        'tx_pageflipper_cover' => [
            'exclude' => true,
            'label' => $ll . 'sys_file_reference.tx_pageflipper_cover',
            'description' => $ll . 'sys_file_reference.tx_pageflipper_cover.description',
            'config' => [
                'type' => 'file',
                'allowed' => 'common-image-types',
                'maxitems' => 1,
                'appearance' => [
                    'createNewRelationLinkTitle' => $ll . 'sys_file_reference.tx_pageflipper_cover.add',
                    'fileByUrlAllowed' => false,
                ],
                'overrideChildTca' => [
                    'types' => [
                        AbstractFile::FILETYPE_IMAGE => [
                            'showitem' => '--palette--;;imageoverlayPalette, --palette--;;filePalette',
                        ],
                    ],
                ],
            ],
        ],
    ]);

    // Only used by the PDF references of the PageFlipper content element (see tt_content overrideChildTca)
    $GLOBALS['TCA']['sys_file_reference']['palettes']['pageflipperFilePalette'] = [
        'showitem' => 'title, description, --linebreak--, tx_pageflipper_cover',
    ];
})();
