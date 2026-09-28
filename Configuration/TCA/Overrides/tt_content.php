<?php

declare(strict_types=1);

use TYPO3\CMS\Core\Resource\AbstractFile;
use TYPO3\CMS\Core\Utility\ExtensionManagementUtility;

defined('TYPO3') or die();

(static function (): void {
    $cType = 'pageflipper';
    $ll = 'LLL:EXT:pageflipper/Resources/Private/Language/locallang_db.xlf:';

    ExtensionManagementUtility::addTcaSelectItem(
        'tt_content',
        'CType',
        [
            'label' => $ll . 'wizard.title',
            'value' => $cType,
            'icon' => 'pageflipper-content-element',
            'group' => 'default',
        ]
    );
    $GLOBALS['TCA']['tt_content']['ctrl']['typeicon_classes'][$cType] = 'pageflipper-content-element';

    $fileReferenceShowitem = '--palette--;;pageflipperFilePalette, --palette--;;filePalette';

    ExtensionManagementUtility::addTCAcolumns('tt_content', [
        'tx_pageflipper_files' => [
            'exclude' => true,
            'label' => $ll . 'tt_content.tx_pageflipper_files',
            'description' => $ll . 'tt_content.tx_pageflipper_files.description',
            'config' => [
                'type' => 'file',
                'allowed' => 'pdf',
                'appearance' => [
                    'createNewRelationLinkTitle' => $ll . 'tt_content.tx_pageflipper_files.add',
                    'fileByUrlAllowed' => false,
                    'showPossibleLocalizationRecords' => true,
                ],
                'overrideChildTca' => [
                    'types' => [
                        AbstractFile::FILETYPE_UNKNOWN => ['showitem' => $fileReferenceShowitem],
                        AbstractFile::FILETYPE_APPLICATION => ['showitem' => $fileReferenceShowitem],
                    ],
                ],
            ],
        ],
        'tx_pageflipper_layout' => [
            'exclude' => true,
            'label' => $ll . 'tt_content.tx_pageflipper_layout',
            'config' => [
                'type' => 'select',
                'renderType' => 'selectSingle',
                'items' => [
                    ['label' => $ll . 'tt_content.tx_pageflipper_layout.covers', 'value' => 'covers'],
                    ['label' => $ll . 'tt_content.tx_pageflipper_layout.tiles', 'value' => 'tiles'],
                    ['label' => $ll . 'tt_content.tx_pageflipper_layout.cards', 'value' => 'cards'],
                ],
                'default' => 'covers',
            ],
        ],
        'tx_pageflipper_show_titles' => [
            'exclude' => true,
            'label' => $ll . 'tt_content.tx_pageflipper_show_titles',
            'description' => $ll . 'tt_content.tx_pageflipper_show_titles.description',
            'config' => [
                'type' => 'check',
                'renderType' => 'checkboxToggle',
                'default' => 1,
            ],
        ],
        'tx_pageflipper_columns' => [
            'exclude' => true,
            'label' => $ll . 'tt_content.tx_pageflipper_columns',
            'description' => $ll . 'tt_content.tx_pageflipper_columns.description',
            'config' => [
                'type' => 'select',
                'renderType' => 'selectSingle',
                'items' => [
                    ['label' => '1', 'value' => 1],
                    ['label' => '2', 'value' => 2],
                    ['label' => '3', 'value' => 3],
                    ['label' => '4', 'value' => 4],
                ],
                'default' => 3,
            ],
        ],
        'tx_pageflipper_page_mode' => [
            'exclude' => true,
            'label' => $ll . 'tt_content.tx_pageflipper_page_mode',
            'config' => [
                'type' => 'select',
                'renderType' => 'selectSingle',
                'items' => [
                    ['label' => $ll . 'tt_content.tx_pageflipper_page_mode.double', 'value' => 'double'],
                    ['label' => $ll . 'tt_content.tx_pageflipper_page_mode.single', 'value' => 'single'],
                ],
                'default' => 'double',
            ],
        ],
        'tx_pageflipper_navigation' => [
            'exclude' => true,
            'label' => $ll . 'tt_content.tx_pageflipper_navigation',
            'config' => [
                'type' => 'check',
                'renderType' => 'checkboxToggle',
                'default' => 1,
            ],
        ],
        'tx_pageflipper_fullscreen' => [
            'exclude' => true,
            'label' => $ll . 'tt_content.tx_pageflipper_fullscreen',
            'config' => [
                'type' => 'check',
                'renderType' => 'checkboxToggle',
                'default' => 1,
            ],
        ],
        'tx_pageflipper_zoom' => [
            'exclude' => true,
            'label' => $ll . 'tt_content.tx_pageflipper_zoom',
            'config' => [
                'type' => 'check',
                'renderType' => 'checkboxToggle',
                'default' => 1,
            ],
        ],
        'tx_pageflipper_download' => [
            'exclude' => true,
            'label' => $ll . 'tt_content.tx_pageflipper_download',
            'config' => [
                'type' => 'check',
                'renderType' => 'checkboxToggle',
                'default' => 1,
            ],
        ],
    ]);

    $GLOBALS['TCA']['tt_content']['palettes']['pageflipperLayout'] = [
        'label' => $ll . 'palette.layout',
        'showitem' => 'tx_pageflipper_layout, tx_pageflipper_columns, --linebreak--, tx_pageflipper_show_titles',
    ];
    $GLOBALS['TCA']['tt_content']['palettes']['pageflipperViewer'] = [
        'label' => $ll . 'palette.viewer',
        'showitem' => 'tx_pageflipper_page_mode, --linebreak--, '
            . 'tx_pageflipper_navigation, tx_pageflipper_fullscreen, tx_pageflipper_zoom, tx_pageflipper_download',
    ];

    $GLOBALS['TCA']['tt_content']['types'][$cType] = [
        'showitem' => '
            --div--;LLL:EXT:core/Resources/Private/Language/Form/locallang_tabs.xlf:general,
                --palette--;;general,
                --palette--;;headers,
                tx_pageflipper_files,
            --div--;' . $ll . 'tab.flipbook,
                --palette--;;pageflipperLayout,
                --palette--;;pageflipperViewer,
            --div--;LLL:EXT:frontend/Resources/Private/Language/locallang_ttc.xlf:tabs.appearance,
                --palette--;;frames,
                --palette--;;appearanceLinks,
            --div--;LLL:EXT:core/Resources/Private/Language/Form/locallang_tabs.xlf:language,
                --palette--;;language,
            --div--;LLL:EXT:core/Resources/Private/Language/Form/locallang_tabs.xlf:access,
                --palette--;;hidden,
                --palette--;;access,
            --div--;LLL:EXT:core/Resources/Private/Language/Form/locallang_tabs.xlf:categories,
                categories,
            --div--;LLL:EXT:core/Resources/Private/Language/Form/locallang_tabs.xlf:notes,
                rowDescription,
            --div--;LLL:EXT:core/Resources/Private/Language/Form/locallang_tabs.xlf:extended,
        ',
    ];
})();
